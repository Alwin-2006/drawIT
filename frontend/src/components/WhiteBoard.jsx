import React, { useEffect, useRef, useState } from 'react';
import { getSocket, onDrawing, onDrawingHistory, onClearDrawing, sendDrawing, sendClearDrawing } from '../socket.js';
import { getCanvasCoordinates, drawLine, handlePointerDown, handlePointerMove } from '../utils/whiteboardUtils.js';

function WhiteBoard({ room }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const [tool, setTool] = useState('pencil');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctxRef.current = ctx;
    };

    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    return () => {
      window.removeEventListener('resize', setupCanvas);
    };
  }, []);
  
  useEffect(() => {
    const handler = (data) => {
      if (!data?.from || !data?.to) return;
      drawLine({
        ctx: ctxRef.current,
        from: data.from,
        to: data.to,
        tool: data.tool,
        color: data.color,
        width: data.width,
      });
    };

    const historyHandler = (history) => {
      if (!Array.isArray(history)) return;
      history.forEach((data) => {
        if (!data?.from || !data?.to) return;
        drawLine({
          ctx: ctxRef.current,
          from: data.from,
          to: data.to,
          tool: data.tool,
          color: data.color,
          width: data.width,
        });
      });
    };

    onDrawing(handler);
    onDrawingHistory(historyHandler);

    const clearHandler = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.restore();
    };

    onClearDrawing(clearHandler);

    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('drawing', handler);
        socket.off('drawingHistory', historyHandler);
        socket.off('clearDrawing', clearHandler);
      }
    };
  }, []);

  // pointer handlers are implemented in utils and called directly from JSX

  const handlePointerUp = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = false;
    canvas.releasePointerCapture(event.pointerId);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.restore();

    if (room) sendClearDrawing({ room });
  };

  return (
    <div className='flex h-full w-full flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <button
          type='button'
          className={`rounded border px-3 py-1 ${tool === 'pencil' ? 'bg-[var(--color-primary)] text-[var(--color-neutral)]' : 'bg-[var(--color-neutral)] text-[var(--color-primary)]'}`}
          onClick={() => setTool('pencil')}
        >
          Pencil
        </button>
        <button
          type='button'
          className={`rounded border px-3 py-1 ${tool === 'eraser' ? 'bg-[var(--color-primary)] text-[var(--color-neutral)]' : 'bg-[var(--color-neutral)] text-[var(--color-primary)]'}`}
          onClick={() => setTool('eraser')}
        >
          Eraser
        </button>
        <button
          type='button'
          className='rounded border bg-[var(--color-neutral)] px-3 py-1 text-[var(--color-primary)]'
          onClick={handleClear}
        >
          Clear
        </button>
      </div>
      <div className='relative flex-1 overflow-hidden rounded '>
        <canvas
          ref={canvasRef}
          className='h-full w-full touch-none bg-white'
          onPointerDown={(e) => handlePointerDown(e, canvasRef, lastPointRef, isDrawingRef)}
          onPointerMove={(e) => handlePointerMove(e, canvasRef, lastPointRef, isDrawingRef, ctxRef, tool, room, sendDrawing)}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  );
}

export default WhiteBoard