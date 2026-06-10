import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataUrl: () => string; // base64 PNG, no data: prefix
  clear: () => void;
}

const SignaturePad = forwardRef<SignaturePadHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const drawn     = useRef(false);
  const [empty, setEmpty] = useState(true);

  function initCtx(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) initCtx(canvas);
  }, []);

  function toCanvasPos(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toCanvasPos(canvas, clientX, clientY);
    canvas.getContext('2d')!.beginPath();
    canvas.getContext('2d')!.moveTo(p.x, p.y);
    drawing.current = true;
  }

  function continueDraw(clientX: number, clientY: number) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toCanvasPos(canvas, clientX, clientY);
    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawn.current = true;
    setEmpty(false);
  }

  function stopDraw() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initCtx(canvas);
    drawn.current = false;
    setEmpty(true);
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !drawn.current,
    toDataUrl: () => canvasRef.current?.toDataURL('image/png').split(',')[1] ?? '',
    clear,
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={140}
        className="w-full border border-slate-200 rounded-lg cursor-crosshair touch-none bg-white"
        style={{ height: '120px' }}
        onMouseDown={(e) => startDraw(e.clientX, e.clientY)}
        onMouseMove={(e) => continueDraw(e.clientX, e.clientY)}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={(e) => { e.preventDefault(); const t = e.touches[0]; startDraw(t.clientX, t.clientY); }}
        onTouchMove={(e)  => { e.preventDefault(); const t = e.touches[0]; continueDraw(t.clientX, t.clientY); }}
        onTouchEnd={(e)   => { e.preventDefault(); stopDraw(); }}
      />
      <div className="flex justify-between items-center mt-1.5">
        <span className={`text-xs ${empty ? 'text-slate-400' : 'text-emerald-600 font-medium'}`}>
          {empty ? 'חתום כאן...' : 'חתימה הוזנה ✓'}
        </span>
        {!empty && (
          <button type="button" onClick={clear}
            className="text-xs text-slate-400 hover:text-red-500 transition">
            נקה
          </button>
        )}
      </div>
    </div>
  );
});
SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;
