/*
    notes:
     useRef to gain access to the canvas HTML
    and ctx(given from canvas.getContext('2d')) is referring to the browser API which allows us to draw
    getBoundingClientRect returns the rectangle surrounding the html-important for calculating positions of the pointer

    1.getCanvasCoordinates-> returns the coordinates of the mouse, important because pixel can vary according to screen size

    2.drawLine-
    ctx.save()- stores all the info related to ctx like colors,tool etc
    ctx.beginpath()- tells the browser API that we're drawing right now
    ctx.moveto(x1,y1)- tells the browser what point we're at right now
    ctx.lineto(x2,y2)-draws a line to x2,y2 from x1,y1 as done by ctx.moveto
    ctx.stroke()- tells browser to apply changes
    ctx.closePath()- not needed for free drawing but it connects end of the path back to the start

    3. handlePointerdown-
    gets the current pointer coordinates wrt to the canvas(using the 1. function)
    

*/




export const getCanvasCoordinates = (event, canvas) => {
  const rect = canvas.getBoundingClientRect(); // gets the smallest boundary of canvas

  return {
    x: (event.clientX - rect.left) ,
    y: (event.clientY - rect.top),
  };
};

export const drawLine = ({ ctx, from, to, tool, color, width }) => {
  if (!ctx) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width || 4;
  ctx.strokeStyle = color || '#000000';
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.closePath();
  ctx.restore();
};

export const handlePointerDown = (event, canvasRef, lastPointRef, isDrawingRef) => {
  const canvas = canvasRef?.current;
  if (!canvas) return;

  const point = getCanvasCoordinates(event, canvas);
  lastPointRef.current = point;
  isDrawingRef.current = true;
  try {
    canvas.setPointerCapture?.(event.pointerId);
  } catch (err) {
    // ignore if unsupported
  }
};

export const handlePointerMove = (
  event,
  canvasRef,
  lastPointRef,
  isDrawingRef,
  ctxRef,
  tool,
  room,
  sendDrawingFn,
) => {
  if (!isDrawingRef.current) return;
  const canvas = canvasRef?.current;
  if (!canvas) return;

  const point = getCanvasCoordinates(event, canvas);
  const start = lastPointRef.current;
  const drawingInfo = {
    ctx: ctxRef?.current,
    from: start,
    to: point,
    tool,
    color: tool === 'eraser' ? '#ffffff' : '#000000',
    width: tool === 'eraser' ? 24 : 4,
  };

  drawLine(drawingInfo);
  lastPointRef.current = point;

  if (room && typeof sendDrawingFn === 'function') {
    sendDrawingFn({
      room,
      from: start,
      to: point,
      tool,
      color: drawingInfo.color,
      width: drawingInfo.width,
    });
  }
};
