// @link WebViewer: https://www.pdftron.com/api/web/WebViewer.html
// @link WebViewer.loadDocument: https://www.pdftron.com/api/web/WebViewer.html#loadDocument__anchor

// @link DocumentViewer: https://www.pdftron.com/api/web/CoreControls.DocumentViewer.html
// @link DocumentViewer.getViewportRegionRect: https://www.pdftron.com/api/web/CoreControls.DocumentViewer.html#getViewportRegionRect__anchor
// @link DocumentViewer.getCurrentPage: https://www.pdftron.com/api/web/CoreControls.DocumentViewer.html#getCurrentPage__anchor

// @link CoreControls: https://www.pdftron.com/api/web/CoreControls.html
// @link PartRetrievers: https://www.pdftron.com/api/web/PartRetrievers.html

// @link Document: https://www.pdftron.com/api/web/CoreControls.Document.html
// @link Document.loadAsync: https://www.pdftron.com/api/web/CoreControls.Document.html#loadAsync__anchor
// @link Document.cancelLoadCanvas: https://www.pdftron.com/api/web/CoreControls.Document.html#cancelLoadCanvas__anchor
// if (CoreControls) {
//   CoreControls.setWorkerPath('../../../lib/core');
// }

/**
 * If in IE11, it will have value of true
 */
var shouldDisplayBeforeDocRendered = (!!window.MSInputMethodContext && !!document.documentMode);

var workerTransportPromise;
var currentLoadCanvas = {};
var lastRenderRect = {};
var viewers = [];
var instances = {};

/**
 * Used to figure out smallest scale value > 0
 * so that canvase won't appear inverted
 */
var minScaleVal;

var PANEL_IDS = {
  LEFT_PANEL: 'leftPanel',
  MIDDLE_PANEL: 'middlePanel',
  RIGHT_PANEL: 'rightPanel',
};

var VIEWER_IDS = [
  { panel: PANEL_IDS.LEFT_PANEL },
  { panel: PANEL_IDS.MIDDLE_PANEL },
  { panel: PANEL_IDS.RIGHT_PANEL },
];

var TRANSFORMATION_DELTA = 1;

/**
 * Keeps track of the original canvas for each page
 * so that it can be retrieved easily when applying a transformation via nudge tool
 */
var originalCanvases = [];

function isPixelWhite(data, index) {
  for (var i = 0; i < 3; i++) {
    if (data[index + i] !== 255) {
      return false;
    }
  }
  return true;
}

function isPixelDataEqual(data1, data2, index) {
  for (var i = 0; i < 4; i++) {
    if (data1[index + i] !== data2[index + i]) {
      return false;
    }
  }
  return true;
}

function getCoords(i, width) {
  var pixels = Math.floor(i / 4);
  return {
    x: pixels % width,
    y: Math.floor(pixels / width),
  };
}

function getIndex(coords, width) {
  return ((coords.y * width) + coords.x) * 4;
}

function diffPixels(pageCanvas, firstDocCanvas, firstDocData) {
  pageCanvas.style.position = 'absolute';
  pageCanvas.style.zIndex = 25;
  pageCanvas.style.left = firstDocCanvas.style.left;
  pageCanvas.style.top = firstDocCanvas.style.top;
  pageCanvas.style.backgroundColor = '';

  pageCanvas.classList.add('canvasOverlay');
  firstDocCanvas.parentNode.appendChild(pageCanvas);

  var ctx = pageCanvas.getContext('2d');
  var secondDocImageData = ctx.getImageData(0, 0, pageCanvas.width, pageCanvas.height);
  var secondDocData = secondDocImageData.data;

  for (var i = 0; i < secondDocData.length; i += 4) {
    var coords = getCoords(i, pageCanvas.width);
    var index = getIndex(coords, firstDocCanvas.width);
    var lightness;
    if (isPixelWhite(firstDocData, index) && isPixelWhite(secondDocData, index)) {
      // if pixel is white, make it transparent
      secondDocData[i + 3] = 0;
    } else if (isPixelDataEqual(firstDocData, secondDocData, index)) {
      // if pixel values are the same, make it grey
      lightness = (secondDocData[index] + secondDocData[index + 1] + secondDocData[index + 2]) / 6;

      secondDocData[i] = 128 + lightness;
      secondDocData[i + 1] = 128 + lightness;
      secondDocData[i + 2] = 128 + lightness;
    } else if (coords.y <= firstDocCanvas.height && coords.x <= firstDocCanvas.width) {
      if (isPixelWhite(firstDocData, index)) {
        lightness = (secondDocData[i] + secondDocData[i + 1] + secondDocData[i + 2]) / 3;
        // if the pixel is white in first document only, color it blue
        secondDocData[i] = lightness;
        secondDocData[i + 1] = lightness;
        secondDocData[i + 2] = 255;
      } else if (isPixelWhite(secondDocData, index)) {
        lightness = (firstDocData[index] + firstDocData[index + 1] + firstDocData[index + 2]) / 3;
        // if the pixel is white in second document only, color it red
        secondDocData[i] = 255;
        secondDocData[i + 1] = lightness;
        secondDocData[i + 2] = lightness;
      } else {
        var firstLightness = (firstDocData[index] + firstDocData[index + 1] + firstDocData[index + 2]) / 3;
        var secondLightness = (secondDocData[i] + secondDocData[i + 1] + secondDocData[i + 2]) / 3;
        lightness = (firstLightness + secondLightness) / 2;

        // otherwise, color it magenta-ish based on color difference
        var colorDifference = Math.abs(secondDocData[i] - firstDocData[index])
            + Math.abs(secondDocData[i + 1] - firstDocData[index + 1])
            + Math.abs(secondDocData[i + 2] - firstDocData[index + 2]);

        var diffPercent = colorDifference / (255 * 3);
        var valChange = lightness * diffPercent;

        var magentaVal = lightness + valChange;

        secondDocData[i] = magentaVal;
        secondDocData[i + 1] = lightness - valChange;
        secondDocData[i + 2] = magentaVal;
      }
    }
  }
  ctx.putImageData(secondDocImageData, 0, 0);
}

function computeNewCoordsFromZoomRotation(currZoom, currRotation, dX, dY) {
  var result = [dX, dY];
  // https://www.pdftron.com/api/web/PDFNet.Page.html#.rotationToDegree__anchor
  switch (currRotation) {
    // 0 deg
    case 0:
      result = [dX * currZoom, dY * currZoom];
      break;
    // 90 deg
    case 1:
      result = [dY * currZoom * -1, dX * currZoom];
      break;
    // 180 deg
    case 2:
      result = [dX * currZoom, dY * currZoom * -1];
      break;
    // 270 deg
    case 3:
      result = [dY * currZoom, dX * currZoom];
      break;
  }
  return result;
}

function updateMiddlePanelDiff(pageIndexToApplyDiff) {
  if (!originalCanvases[pageIndexToApplyDiff]) {
    return;
  }
  var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;
  var documentContainer = instances[PANEL_IDS.MIDDLE_PANEL].documentContainer;

  var canvas = originalCanvases[pageIndexToApplyDiff];
  // eslint-disable-next-line no-undef
  var transformationToApply = getPageTransformationState(pageIndexToApplyDiff);

  // var coords = computeNewCoordsFromZoomRotation(instance.docViewer.getZoom(),
  //   instance.docViewer.getRotation(),
  //   transformationToApply.horizontalTranslation * TRANSFORMATION_DELTA,
  //   transformationToApply.verticalTranslation * TRANSFORMATION_DELTA);

  var newCanvas = document.createElement('canvas');
  var newCanvasCtx = newCanvas.getContext('2d');

  newCanvas.setAttribute('width', canvas.width);
  newCanvas.setAttribute('height', canvas.height);

  newCanvas.style.width = canvas.style.width;
  newCanvas.style.height = canvas.style.height;

  newCanvasCtx.fillStyle = 'white';
  newCanvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  newCanvasCtx.save();

  newCanvasCtx.translate(transformationToApply.horizontalTranslation, transformationToApply.verticalTranslation);

  // TODO translate so that we can rotate using the center as the focal point

  var newScale = ((TRANSFORMATION_DELTA * transformationToApply.scaling) + 100) / 100;
  if (newScale >= 0) {
    minScaleVal = newScale;
    newCanvasCtx.scale(newScale, newScale);
  } else {
    newCanvasCtx.scale(minScaleVal, minScaleVal);
  }
  // rotate params must be in radians
  newCanvasCtx.rotate((transformationToApply.rotation) * Math.PI / 180 * 1);

  newCanvasCtx.drawImage(canvas, 0, 0);

  newCanvasCtx.restore();

  // eslint-disable-next-line prefer-template
  var firstDocCanvas = documentContainer.querySelector('.canvas' + pageIndexToApplyDiff);
  if (!firstDocCanvas) {
    return;
  }
  var firstDocCtx = firstDocCanvas.getContext('2d');
  var firstDocData = firstDocCtx.getImageData(0, 0, firstDocCanvas.width, firstDocCanvas.height).data;

  var existingOverlay = firstDocCanvas.parentNode.querySelector('.canvasOverlay');
  if (existingOverlay) {
    existingOverlay.parentNode.removeChild(existingOverlay);
  }
  diffPixels(newCanvas, firstDocCanvas, firstDocData);
}

function updatePage(doc, documentContainer, instance, pageIndex) {
  // eslint-disable-next-line prefer-template
  var firstDocCanvas = documentContainer.querySelector('.canvas' + pageIndex);
  if (!firstDocCanvas) {
    return;
  }
  var isViewportRender = firstDocCanvas.style.left !== '';

  return doc.loadCanvasAsync({
    pageIndex: pageIndex,
    canvasNum: 1,
    pageRotation: instance.docViewer.getRotation(),
    getZoom: function() {
      return instance.docViewer.getZoom();
    },
    drawComplete: function(pageCanvas) {
      originalCanvases[pageIndex] = pageCanvas;
      updateMiddlePanelDiff(pageIndex);
      currentLoadCanvas[pageIndex] = null;
    },
    renderRect: isViewportRender ? Object.assign({}, lastRenderRect[pageIndex]) : undefined,
  });
}

function update(panel, pageIndex) {
  var newDoc = instances[panel].newDoc;
  var documentContainer = instances[panel].documentContainer;
  var instance = instances[panel].instance;

  if (currentLoadCanvas[pageIndex]) {
    newDoc.cancelLoadCanvas(currentLoadCanvas[pageIndex]);
  }
  currentLoadCanvas[pageIndex] = updatePage(newDoc, documentContainer, instance, pageIndex);
}

var originalScroller = null;
var scrollTimeout;

// Create an instance of worker transport to share among WebViewer instances
function getWorkerTransportPromise() {
  return workerTransportPromise || CoreControls.getDefaultBackendType().then(function(backendType) {
    workerTransportPromise = CoreControls.initPDFWorkerTransports(backendType, {});
    return workerTransportPromise;
  });
}

function loadDocument(panel, docLocation) {
  var CoreControls = instances[panel].instance.CoreControls;

  CoreControls.createDocument(docLocation, { workerTransportPromise: getWorkerTransportPromise() })
    .then(function(newDoc) {
      instances[panel] = Object.assign({}, instances[panel], { newDoc: newDoc });
    });
}

function openDoc(panel, firstPdf, secondPdf) {
  var instance = instances[panel].instance;
  instance.loadDocument(firstPdf);

  if (panel === PANEL_IDS.MIDDLE_PANEL && secondPdf) {
    loadDocument(panel, secondPdf);
  }
}

// Synchronizes scrolling of WebViewer instances
function syncScrolls(scrollLeft, scrollTop) {
  viewers.forEach(function(item) {
    const documentContainer = instances[item.panel].documentContainer;

    if (!documentContainer) {
      return;
    }

    if (documentContainer.scrollLeft !== scrollLeft) {
      documentContainer.scrollLeft = scrollLeft;
    }

    if (documentContainer.scrollTop !== scrollTop) {
      documentContainer.scrollTop = scrollTop;
    }
  });
}

// Synchronizes zooming of WebViewer instances
function syncZoom(zoom) {
  viewers.forEach(function(item) {
    var instance = instances[item.panel].instance;

    if (instance.getZoomLevel() !== zoom) {
      instance.setZoomLevel(zoom);
    }
  });
}

// Synchronizes rotation of the page
function syncRotation(rotation) {
  viewers.forEach(function(item) {
    var instance = instances[item.panel].instance;

    if (instance.docViewer.getRotation() !== rotation) {
      instance.docViewer.setRotation(rotation);
    }
  });
}

function align(line1StartPoint, line1EndPoint, line2StartPoint, line2EndPoint) {
  var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;
  var currPageIndex = instance.docViewer.getCurrentPage() - 1;

  var canvas = originalCanvases[currPageIndex];
  /**
   * If one PDF doc is longer than the other and we are comparing a page number that doesn't exist in the other doc
   * Do nothing
   */
  if (!canvas) {
    alert('Unable to compare pages');
    return;
  }

  var deltaX2 = line2EndPoint.x - line2StartPoint.x;
  var deltaY2 = line2EndPoint.y - line2StartPoint.y;

  // get the length
  var length2 = Math.sqrt(deltaX2 * deltaX2 + deltaY2 * deltaY2);

  var deltaX1 = line1EndPoint.x - line1StartPoint.x;
  var deltaY1 = line1EndPoint.y - line1StartPoint.y;

  // get the length
  var length1 = Math.sqrt(deltaX1 * deltaX1 + deltaY1 * deltaY1);

  var newCanvas = document.createElement('canvas');
  var newCanvasCtx = newCanvas.getContext('2d');

  newCanvas.setAttribute('width', canvas.width);
  newCanvas.setAttribute('height', canvas.height);

  newCanvas.style.width = canvas.style.width;
  newCanvas.style.height = canvas.style.height;

  newCanvasCtx.fillStyle = 'white';
  newCanvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var rotatedX = function(x, y, radianAngle) {
    return (x * Math.cos(radianAngle)) + (y * Math.sin(radianAngle));
  };

  var rotatedY = function(x, y, radianAngle) {
    return (-1 * x * Math.sin(radianAngle)) + (y * Math.cos(radianAngle));
  };

  /**
   * https://math.stackexchange.com/questions/1544147/find-transform-matrix-that-transforms-one-line-segment-to-another
   */
  newCanvasCtx.save();

  var someAngle = Math.atan2(line2EndPoint.y - line2StartPoint.y, line2EndPoint.x - line2StartPoint.x);
  var someAngle2 = Math.atan2(line1EndPoint.y - line1StartPoint.y, line1EndPoint.x - line1StartPoint.x);

  newCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);

  newCanvasCtx.translate(line2StartPoint.x, line2StartPoint.y);
  if ((line2StartPoint.x > line2EndPoint.x || line2StartPoint.y > line2EndPoint.y)) {
    // start point is farther from end point
    someAngle *= -1;
  }
  else {
    // end point is farther from start point
    if (someAngle > 0) {
      someAngle *= -1;
    }
  }
  newCanvasCtx.rotate(someAngle);

  var scaleFactor = length1 / length2;

  newCanvasCtx.scale(scaleFactor, scaleFactor);
  newCanvasCtx.rotate(someAngle2);

  var translateXBack = -rotatedX(line2StartPoint.x, line2StartPoint.y, someAngle + someAngle2) / scaleFactor;
  var translateYBack = -rotatedY(line2StartPoint.x, line2StartPoint.y, someAngle + someAngle2) / scaleFactor;

  newCanvasCtx.translate(translateXBack, translateYBack);
  newCanvasCtx.translate(rotatedX(line1StartPoint.x, line1StartPoint.y, someAngle + someAngle2) / scaleFactor, rotatedY(line1StartPoint.x, line1StartPoint.y, someAngle + someAngle2) / scaleFactor);
  newCanvasCtx.translate(-line2StartPoint.x, -line2StartPoint.y);

  // https://math.stackexchange.com/questions/13150/extracting-rotation-scale-values-from-2d-transformation-matrix
  var transformationMatrix = newCanvasCtx.getTransform();
  var scaleX = Math.sqrt((transformationMatrix.a * transformationMatrix.a) + (transformationMatrix.b * transformationMatrix.b));
  var angle = Math.atan2(transformationMatrix.c, transformationMatrix.d) * -1;
  setPageTransformationState(currPageIndex, transformationMatrix.e, transformationMatrix.f, ((100 * scaleX) - 100) / TRANSFORMATION_DELTA, angle * 180 / Math.PI);
  // newCanvasCtx.setTransform(transformationMatrix.a, transformationMatrix.b, transformationMatrix.c, transformationMatrix.d, transformationMatrix.e, transformationMatrix.f);

  newCanvasCtx.drawImage(canvas, 0, 0);

  newCanvasCtx.fillStyle = 'green';
  newCanvasCtx.beginPath();
  newCanvasCtx.moveTo(line2StartPoint.x, line2StartPoint.y);
  newCanvasCtx.lineTo(line2EndPoint.x, line2EndPoint.y);

  newCanvasCtx.strokeStyle = 'red';
  newCanvasCtx.stroke();
  newCanvasCtx.restore();
  
  var documentContainer = instances[PANEL_IDS.MIDDLE_PANEL].documentContainer;
  // eslint-disable-next-line prefer-template
  var firstDocCanvas = documentContainer.querySelector('.canvas' + currPageIndex);
  if (!firstDocCanvas) {
    return;
  }
  var firstDocCtx = firstDocCanvas.getContext('2d');
  var firstDocData = firstDocCtx.getImageData(0, 0, firstDocCanvas.width, firstDocCanvas.height).data;
  firstDocCtx.save();
  firstDocCtx.setTransform(1, 0, 0, 1, 0, 0);
  firstDocCtx.fillStyle = 'blue';
  firstDocCtx.beginPath();
  firstDocCtx.moveTo(line1StartPoint.x, line1StartPoint.y);
  firstDocCtx.lineTo(line1EndPoint.x, line1EndPoint.y);

  firstDocCtx.strokeStyle = 'yellow';
  firstDocCtx.stroke();
  firstDocCtx.restore();

  var existingOverlay = firstDocCanvas.parentNode.querySelector('.canvasOverlay');
  if (existingOverlay) {
    existingOverlay.parentNode.removeChild(existingOverlay);
  }
  diffPixels(newCanvas, firstDocCanvas, firstDocData);
}

// Create an instance of WebViewer
function setupViewer(item) {
  return new Promise(function(resolve) {
    var viewerElement = document.getElementById(item.panel);

    WebViewer({
      path: '../../../lib',
      // share a single instame of the worker transport
      workerTransportPromise: getWorkerTransportPromise(),
      initialDoc: item.pdf || null,
      // disable annotation rendering
      enableAnnotations: false,
    }, viewerElement)
      .then(function(instance) {
        var docViewer = instance.docViewer;

        docViewer.on('documentLoaded', function() {
          if (!instances[item.panel].documentContainer) {
            var documentContainer = viewerElement.querySelector('iframe').contentDocument.querySelector('.DocumentContainer');
            instances[item.panel] = Object.assign({}, instances[item.panel], {
              documentContainer: documentContainer,
            });

            // Sync all WebViewer instances when scroll changes
            documentContainer.onscroll = function() {
              if (!originalScroller || originalScroller === documentContainer) {
                originalScroller = documentContainer;
                syncScrolls(documentContainer.scrollLeft, documentContainer.scrollTop);
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(function() {
                  originalScroller = null;
                }, 50);
              }
            };
          }
        });

        // Update zoom value of the WebViewer instances
        docViewer.on('zoomUpdated', function(zoom) {
          syncZoom(zoom);
        });

        // Update rotation value of the WebViewer instances
        docViewer.on('rotationUpdated', function(rotation) {
          syncRotation(rotation);
        });

        viewers.push(item);

        instances[item.panel] = {
          instance: instance,
          viewerElement: viewerElement,
        };

        resolve();
      });
  });
}

function initializeViewers(array, callback) {
  var pageCompleteRenderRect = {};

  Promise.all(array.map(setupViewer)).then(function() {
    var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;

    // eslint-disable-next-line no-undef
    setInstance(instance);

    // disable for middle panel
    instance.disableElements([PANEL_IDS.LEFT_PANEL, 'leftPanelButton', 'searchButton', 'searchPanel', 'searchOverlay']);

    instance.docViewer.on('pageComplete', function(completedPageIndex) {
      pageCompleteRenderRect[completedPageIndex] = lastRenderRect[completedPageIndex];
      update(PANEL_IDS.MIDDLE_PANEL, completedPageIndex);
    });

    instance.docViewer.on('beginRendering', function() {
      var pageIndex = instance.docViewer.getCurrentPage() - 1;
      lastRenderRect[pageIndex] = instance.docViewer.getViewportRegionRect(pageIndex);
      if (currentLoadCanvas[pageIndex]) {
        var newDoc = instances[PANEL_IDS.MIDDLE_PANEL].newDoc;
        newDoc.cancelLoadCanvas(currentLoadCanvas[pageIndex]);
      }
    });

    instance.docViewer.on('finishedRendering', function() {
      var displayMode = instance.docViewer.getDisplayModeManager().getDisplayMode();
      var visiblePages = displayMode.getVisiblePages();

      visiblePages.forEach(function(pageIndex) {
        lastRenderRect[pageIndex] = pageCompleteRenderRect[pageIndex];
        update(PANEL_IDS.MIDDLE_PANEL, pageIndex);
        // eslint-disable-next-line no-undef
        setNudgeDiffToolVisibility(true);
      });
    });

    instance.docViewer.one('finishedRendering', function() {
      // run this only once
      // in IE11, this event is called everytime a pdf is rotated or zoomed in
      // eslint-disable-next-line no-undef
      setUpNudgeToolAndAppendToIFrame();
    });

    return callback(null, instances);
  });
}

function onNudgeToolStateChange() {
  var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;
  var currPageIndex = instance.docViewer.getCurrentPage() - 1;
  updateMiddlePanelDiff(currPageIndex);
}

function initialize(firstPdfRelPath, secondPdfRelPath, nudgeToolVisibilityBeforeDocRendered) {
  openDoc(PANEL_IDS.MIDDLE_PANEL, firstPdfRelPath, secondPdfRelPath);
  openDoc(PANEL_IDS.LEFT_PANEL, firstPdfRelPath);
  openDoc(PANEL_IDS.RIGHT_PANEL, secondPdfRelPath);

  originalCanvases = [];
  // eslint-disable-next-line no-undef
  setNudgeDiffToolVisibility(nudgeToolVisibilityBeforeDocRendered);
  // eslint-disable-next-line no-undef
  resetPageTransformationStates();
}

// Initialize WebViewer instances
initializeViewers(VIEWER_IDS, function() {
  initialize('../../../samples/files/test_doc_1.pdf', '../../../samples/files/test_doc_2.pdf');
  // eslint-disable-next-line no-undef
  initializeDiffAlignmentTool(instances[PANEL_IDS.LEFT_PANEL], instances[PANEL_IDS.RIGHT_PANEL], align);
});

document.getElementById('selectControl').onclick = function(e) {
  e.preventDefault();
  var select1 = document.getElementById('select1');
  var firstPdf = select1.options[select1.selectedIndex].value;
  var select2 = document.getElementById('select2');
  var secondPdf = select2.options[select2.selectedIndex].value;

  initialize(firstPdf, secondPdf, shouldDisplayBeforeDocRendered);
  initializeDiffAlignmentTool(instances[PANEL_IDS.LEFT_PANEL], instances[PANEL_IDS.RIGHT_PANEL], align);
};

document.getElementById('url-form').onsubmit = function(e) {
  e.preventDefault();

  var firstPdf = document.getElementById('url').value;
  var secondPdf = document.getElementById('url2').value;

  initialize(firstPdf, secondPdf, shouldDisplayBeforeDocRendered);
  initializeDiffAlignmentTool(instances[PANEL_IDS.LEFT_PANEL], instances[PANEL_IDS.RIGHT_PANEL], align);
};

document.getElementById('file-picker-form').onsubmit = function(e) {
  e.preventDefault();
  var firstPdf = document.forms['file-picker-form'][0].files[0];
  var secondPdf = document.forms['file-picker-form'][1].files[0];

  initialize(firstPdf, secondPdf, shouldDisplayBeforeDocRendered);
  initializeDiffAlignmentTool(instances[PANEL_IDS.LEFT_PANEL], instances[PANEL_IDS.RIGHT_PANEL], align);
};

// eslint-disable-next-line no-undef
onStateChange(onNudgeToolStateChange);
// eslint-disable-next-line no-undef
setNudgeDiffToolVisibility(shouldDisplayBeforeDocRendered);
// eslint-disable-next-line no-undef
initNudgeTool();
