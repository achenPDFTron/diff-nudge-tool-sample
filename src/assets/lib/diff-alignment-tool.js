var clicks = 0;

var line1 = { p1: null, p2: null };
var line2 = { p1: null, p2: null };

var originalLeftCanvasData;
var drawLineFxn1;

var originalRightCanvasData;
var drawLineFxn2;

var alignPressedBoundFxn;

var endPointThickness = 4;

var drawLine = function (canvas, lineToUpdate, e) {
  var getCursorPosition = function(e) {
    var x;
    var y;

    if (e.pageX !== undefined && e.pageY !== undefined) {
      x = e.pageX;
      y = e.pageY;
    } else {
      x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
      y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }

    return [x, y];
  };
  var boundingRect = canvas.getBoundingClientRect();
  var ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var mouseX = getCursorPosition(e)[0] - boundingRect.left;
  var mouseY = getCursorPosition(e)[1] - boundingRect.top;

  if (clicks === 0) {
    ctx.fillStyle = 'green';
    ctx.fillRect(mouseX, mouseY, endPointThickness, endPointThickness);
    lineToUpdate.p1.x = mouseX;
    lineToUpdate.p1.y = mouseY;
  } else if (clicks % 2 !== 0) {
    ctx.fillStyle = 'blue';
    ctx.fillRect(mouseX, mouseY, endPointThickness, endPointThickness);
    ctx.beginPath();
    ctx.moveTo(lineToUpdate.p1.x, lineToUpdate.p1.y);
    ctx.lineTo(mouseX, mouseY);

    ctx.strokeStyle = 'red';
    ctx.stroke();

    lineToUpdate.p2.x = mouseX;
    lineToUpdate.p2.y = mouseY;
  }
  clicks++;
  ctx.restore();
};

function removeLine(canvas, originalData) {
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.putImageData(originalData, 0, 0);
}

function initializeDiffAlignmentTool(leftPanelInstance, rightPanelInstance, onAlignPressed) {
  originalLeftCanvasData = null;
  drawLineFxn1 = null;

  originalRightCanvasData = null;
  drawLineFxn2 = null;
  var leftDocViewer = leftPanelInstance.instance.docViewer;

  var me = this;

  line1 = { p1: null, p2: null };
  line2 = { p1: null, p2: null };

  var leftCanvas;
  var rightCanvas;

  document.getElementById('align').removeEventListener('click', alignPressedBoundFxn);

  alignPressedBoundFxn = function() {
    var hasXY = function(point) {
      return point.x && point.y;
    };
    if (line1.p1 && hasXY(line1.p1) && line1.p2 && hasXY(line1.p2) && line2.p1 && hasXY(line2.p1) && line2.p2 && hasXY(line2.p2)) {
      onAlignPressed(line1.p1, line1.p2, line2.p1, line2.p2);
    }
  };

  leftDocViewer.on('documentLoaded', function() {
    var someFxn = function() {
      line1.p1 = {};
      line1.p2 = {};
      clicks = 0;
      var documentContainer = leftPanelInstance.viewerElement.querySelector('iframe').contentDocument.querySelector('.DocumentContainer');
      var instance = leftPanelInstance.instance;
      // getCurrentPage() starts at index 1
      var currPageIndex = instance.docViewer.getCurrentPage() - 1;
      // eslint-disable-next-line prefer-template
      leftCanvas = documentContainer.querySelector('.canvas' + currPageIndex);
      if (!originalLeftCanvasData) {
        originalLeftCanvasData = leftCanvas.getContext('2d').getImageData(0, 0, leftCanvas.width, leftCanvas.height);
      }

      if (drawLineFxn1) {
        leftCanvas.parentNode.removeEventListener('click', drawLineFxn1);
      }
      drawLineFxn1 = drawLine.bind(me, leftCanvas, line1);
      removeLine(leftCanvas, originalLeftCanvasData);
      leftCanvas.parentNode.addEventListener('click', drawLineFxn1);
    };
    document.getElementById('temp1').addEventListener('click', someFxn);
  });

  var rightDocViewer = rightPanelInstance.instance.docViewer;
  rightDocViewer.on('documentLoaded', function() {
    var someFxn = function() {
      line2.p1 = {};
      line2.p2 = {};
      var documentContainer = rightPanelInstance.viewerElement.querySelector('iframe').contentDocument.querySelector('.DocumentContainer');
      var instance = rightPanelInstance.instance;
      clicks = 0;
      // getCurrentPage() starts at index 1
      var currPageIndex = instance.docViewer.getCurrentPage() - 1;
      // eslint-disable-next-line prefer-template
      rightCanvas = documentContainer.querySelector('.canvas' + currPageIndex);
      if (!originalRightCanvasData) {
        originalRightCanvasData = rightCanvas.getContext('2d').getImageData(0, 0, rightCanvas.width, rightCanvas.height);
      }
      if (drawLineFxn2) {
        rightCanvas.parentNode.removeEventListener('click', drawLineFxn2);
      }
      drawLineFxn2 = drawLine.bind(me, rightCanvas, line2);
      removeLine(rightCanvas, originalRightCanvasData);
      rightCanvas.parentNode.addEventListener('click', drawLineFxn2);
    };
    document.getElementById('temp2').addEventListener('click', someFxn);
  });
  document.getElementById('align').addEventListener('click', alignPressedBoundFxn);
}