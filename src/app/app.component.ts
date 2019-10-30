import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';

declare const WebViewer: any;

declare const initNudgeTool: any;
declare const setInstance: any;
declare const getPageTransformationState: any;
declare const resetPageTransformationStates: any;

declare const onStateChange;

const PANEL_IDS = {
  LEFT_PANEL: 'leftPanel',
  MIDDLE_PANEL: 'middlePanel',
  RIGHT_PANEL: 'rightPanel',
};

const VIEWER_IDS = [
  { panel: PANEL_IDS.LEFT_PANEL },
  { panel: PANEL_IDS.MIDDLE_PANEL },
  { panel: PANEL_IDS.RIGHT_PANEL },
];

const currentLoadCanvas = {};
const lastRenderRect = {};
const viewers = [];
const instances = {};

const TRANSFORMATION_DELTA = 1;

/**
 * Keeps track of the original canvas for each page
 * so that it can be retrieved easily when applying a transformation via nudge tool
 */
let originalCanvases = [];

let originalScroller = undefined;
let scrollTimeout = undefined;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
  /**
   * https://www.pdftron.com/documentation/web/get-started/angular/exist-project
   */
  @ViewChild('middlePanel') midPanelViewer: ElementRef;

  wvInstance: any;

  workerTransportPromise: any;

  minScaleVal: number;

  ngAfterViewInit(): void {
    this.initializeViewers(VIEWER_IDS, () => {
      this.initialize('https://pdftron.s3.amazonaws.com/downloads/pl/webviewer-demo.pdf', 'https://pdftron.s3.amazonaws.com/downloads/pl/webviewer-demo.pdf');
    });
  }

  initialize(firstPdfRelPath, secondPdfRelPath) {
    this.openDoc(PANEL_IDS.MIDDLE_PANEL, firstPdfRelPath, secondPdfRelPath);
    this.openDoc(PANEL_IDS.LEFT_PANEL, firstPdfRelPath, undefined);
    this.openDoc(PANEL_IDS.RIGHT_PANEL, secondPdfRelPath, undefined);
  
    originalCanvases = [];
    resetPageTransformationStates();
  }

  openDoc(panel, firstPdf, secondPdf) {
    var instance = instances[panel].instance;
    instance.loadDocument(firstPdf);
  
    if (panel === PANEL_IDS.MIDDLE_PANEL && secondPdf) {
      this.loadDocument(panel, secondPdf);
    }
  }

  loadDocument(panel, docLocation) {
    var CoreControls = instances[panel].instance.CoreControls;

    CoreControls.createDocument(docLocation)
      .then((newDoc) => {
        instances[panel] = Object.assign({}, instances[panel], { newDoc: newDoc });
      });
  }

  setupViewer(item) {
    return new Promise((resolve) => {
      const viewerElement = document.getElementById(item.panel);
      /**
       * https://github.com/angular/angular-cli/wiki/stories-asset-configuration
       * /webviewer defined in ANgular json
       */
      WebViewer({
        path: '/webviewer',
        // share a single instame of the worker transport
        initialDoc: item.pdf || null,
        // disable annotation rendering
        enableAnnotations: false,
      }, viewerElement)
        .then((instance) => {
          const docViewer = instance.docViewer;

          let onScroll;
  
          docViewer.on('documentLoaded', () => {
            if (!instances[item.panel].documentContainer) {
              const documentContainer = viewerElement.querySelector('iframe').contentDocument.querySelector('.DocumentContainer');
              instances[item.panel] = Object.assign({}, instances[item.panel], {
                documentContainer: documentContainer,
              });

              // Sync all WebViewer instances when scroll changes
              onScroll = () => {
                if (!originalScroller || originalScroller === documentContainer) {
                  originalScroller = documentContainer;
                  const scrollLeft = documentContainer.scrollLeft;
                  const scrollTop = documentContainer.scrollTop;
                  viewers.forEach((item) => {
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
                  clearTimeout(scrollTimeout);
                  scrollTimeout = setTimeout(() => {
                    originalScroller = null;
                  }, 50);
                }
              };
              documentContainer.addEventListener('scroll', onScroll);
            }
          });

          docViewer.on('documentUnloaded', () => {
            viewers.forEach((item) => {
              const documentContainer = instances[item.panel].documentContainer;
              if (!documentContainer) {
                return;
              }
              documentContainer.removeEventListener('scroll', onScroll);
            });
          });

          // Update zoom value of the WebViewer instances
          docViewer.on('zoomUpdated', (zoom) => {
            // sync up zoom levels for all WV instances
            viewers.forEach(function(item) {
              var instance = instances[item.panel].instance;
          
              if (instance.getZoomLevel() !== zoom) {
                instance.setZoomLevel(zoom);
              }
            });
          });
  
          // Update rotation value of the WebViewer instances
          docViewer.on('rotationUpdated', (rotation) => {
            // synchronize rotation for all WV instances
            viewers.forEach((item) => {
              var instance = instances[item.panel].instance;
          
              if (instance.docViewer.getRotation() !== rotation) {
                instance.docViewer.setRotation(rotation);
              }
            });
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

  initializeViewers(array, callback) {
    var pageCompleteRenderRect = {};
  
    Promise.all(array.map(this.setupViewer.bind(this))).then(() => {
      var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;
  
      // eslint-disable-next-line no-undef
      setInstance(instance);
  
      // disable for middle panel
      instance.disableElements([PANEL_IDS.LEFT_PANEL, 'leftPanelButton', 'searchButton', 'searchPanel', 'searchOverlay']);
  
      instance.docViewer.on('pageComplete', (completedPageIndex) => {
        pageCompleteRenderRect[completedPageIndex] = lastRenderRect[completedPageIndex];
        this.update(PANEL_IDS.MIDDLE_PANEL, completedPageIndex);
      });
  
      instance.docViewer.on('beginRendering', () => {
        var pageIndex = instance.docViewer.getCurrentPage() - 1;
        lastRenderRect[pageIndex] = instance.docViewer.getViewportRegionRect(pageIndex);
        if (currentLoadCanvas[pageIndex]) {
          var newDoc = instances[PANEL_IDS.MIDDLE_PANEL].newDoc;
          newDoc.cancelLoadCanvas(currentLoadCanvas[pageIndex]);
        }
      });
  
      instance.docViewer.on('finishedRendering', () => {
        var displayMode = instance.docViewer.getDisplayModeManager().getDisplayMode();
        var visiblePages = displayMode.getVisiblePages();
  
        visiblePages.forEach((pageIndex) => {
          lastRenderRect[pageIndex] = pageCompleteRenderRect[pageIndex];
          this.update(PANEL_IDS.MIDDLE_PANEL, pageIndex);
        });
      });
  
      instance.docViewer.one('finishedRendering', () => {
        // run this only once
        // in IE11, this event is called everytime a pdf is rotated or zoomed in
        // eslint-disable-next-line no-undef
        setInstance(instance);
        initNudgeTool();
        onStateChange(() => {
          this.onNudgeToolStateChange();
        });
      });
  
      return callback(null, instances);
    });
  }

  onNudgeToolStateChange() {
    var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;
    var currPageIndex = instance.docViewer.getCurrentPage() - 1;
    this.updateMiddlePanelDiff(currPageIndex);
  }

  update(panel, pageIndex) {
    var newDoc = instances[panel].newDoc;
    var documentContainer = instances[panel].documentContainer;
    var instance = instances[panel].instance;
  
    if (currentLoadCanvas[pageIndex]) {
      newDoc.cancelLoadCanvas(currentLoadCanvas[pageIndex]);
    }
    currentLoadCanvas[pageIndex] = this.updatePage(newDoc, documentContainer, instance, pageIndex);
  }

  updatePage(doc, documentContainer, instance, pageIndex) {
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
      getZoom: () => {
        return instance.docViewer.getZoom();
      },
      drawComplete: (pageCanvas) => {
        originalCanvases[pageIndex] = pageCanvas;
        this.updateMiddlePanelDiff(pageIndex);
        currentLoadCanvas[pageIndex] = null;
      },
      renderRect: isViewportRender ? Object.assign({}, lastRenderRect[pageIndex]) : undefined,
    });
  }

  computeNewCoordsFromZoomRotation(currZoom, currRotation, dX, dY) {
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

  updateMiddlePanelDiff(pageIndexToApplyDiff) {
    if (!originalCanvases[pageIndexToApplyDiff]) {
      return;
    }
    var instance = instances[PANEL_IDS.MIDDLE_PANEL].instance;
    var documentContainer = instances[PANEL_IDS.MIDDLE_PANEL].documentContainer;
  
    var canvas = originalCanvases[pageIndexToApplyDiff];
    // eslint-disable-next-line no-undef
    var transformationToApply = getPageTransformationState(pageIndexToApplyDiff);
  
    var coords = this.computeNewCoordsFromZoomRotation(instance.docViewer.getZoom(),
      instance.docViewer.getRotation(),
      transformationToApply.horizontalTranslation * TRANSFORMATION_DELTA,
      transformationToApply.verticalTranslation * TRANSFORMATION_DELTA);
  
    var newCanvas = document.createElement('canvas');
    var newCanvasCtx = newCanvas.getContext('2d');
  
    newCanvas.setAttribute('width', canvas.width);
    newCanvas.setAttribute('height', canvas.height);
  
    newCanvas.style.width = canvas.style.width;
    newCanvas.style.height = canvas.style.height;
  
    newCanvasCtx.fillStyle = 'white';
    newCanvasCtx.fillRect(0, 0, canvas.width, canvas.height);
  
    newCanvasCtx.save();
  
    // translate so that we can rotate using the center as the focal point
    newCanvasCtx.translate(canvas.width / 2, canvas.height / 2);
  
    var newScale = ((TRANSFORMATION_DELTA * transformationToApply.scaling) + 100) / 100;
    if (newScale >= 0) {
      this.minScaleVal = newScale;
      newCanvasCtx.scale(newScale, newScale);
    } else {
      newCanvasCtx.scale(this.minScaleVal, this.minScaleVal);
    }
    // rotate params must be in radians
    newCanvasCtx.rotate((transformationToApply.rotation) * Math.PI / 180);
    // undo translation so that future transformations are correct
    newCanvasCtx.translate(-canvas.width / 2, -canvas.height / 2);
    newCanvasCtx.translate(coords[0], coords[1]);
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
    this.diffPixels(newCanvas, firstDocCanvas, firstDocData);
  }

  isPixelWhite(data, index) {
    for (var i = 0; i < 3; i++) {
      if (data[index + i] !== 255) {
        return false;
      }
    }
    return true;
  }
  
  isPixelDataEqual(data1, data2, index) {
    for (var i = 0; i < 4; i++) {
      if (data1[index + i] !== data2[index + i]) {
        return false;
      }
    }
    return true;
  }
  
  getCoords(i, width) {
    var pixels = Math.floor(i / 4);
    return {
      x: pixels % width,
      y: Math.floor(pixels / width),
    };
  }
  
  getIndex(coords, width) {
    return ((coords.y * width) + coords.x) * 4;
  }
  
  diffPixels(pageCanvas, firstDocCanvas, firstDocData) {
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
      var coords = this.getCoords(i, pageCanvas.width);
      var index = this.getIndex(coords, firstDocCanvas.width);
      var lightness;
      if (this.isPixelWhite(firstDocData, index) && this.isPixelWhite(secondDocData, index)) {
        // if pixel is white, make it transparent
        secondDocData[i + 3] = 0;
      } else if (this.isPixelDataEqual(firstDocData, secondDocData, index)) {
        // if pixel values are the same, make it grey
        lightness = (secondDocData[index] + secondDocData[index + 1] + secondDocData[index + 2]) / 6;
  
        secondDocData[i] = 128 + lightness;
        secondDocData[i + 1] = 128 + lightness;
        secondDocData[i + 2] = 128 + lightness;
      } else if (coords.y <= firstDocCanvas.height && coords.x <= firstDocCanvas.width) {
        if (this.isPixelWhite(firstDocData, index)) {
          lightness = (secondDocData[i] + secondDocData[i + 1] + secondDocData[i + 2]) / 3;
          // if the pixel is white in first document only, color it blue
          secondDocData[i] = lightness;
          secondDocData[i + 1] = lightness;
          secondDocData[i + 2] = 255;
        } else if (this.isPixelWhite(secondDocData, index)) {
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
}
