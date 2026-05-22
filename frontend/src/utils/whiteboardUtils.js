export const getCanvasCoordinates = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const ratioX = canvas.width / rect.width;
  const ratioY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * ratioX,
    y: (event.clientY - rect.top) * ratioY,
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
