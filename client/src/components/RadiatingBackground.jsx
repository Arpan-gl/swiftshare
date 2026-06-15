import { useEffect, useRef } from 'react';

/**
 * RadiatingBackground
 * @param {boolean} isActive   - whether transfer is in progress
 * @param {number}  progress   - 0..100
 * @param {'up'|'down'} direction - 'up' for sender, 'down' for receiver
 */
export default function RadiatingBackground({ isActive = false, progress = 0, direction = 'up' }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({ isActive, progress, direction });

  useEffect(() => {
    stateRef.current = { isActive, progress, direction };
  }, [isActive, progress, direction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /* ── resize helper ── */
    function syncSize() {
      const w = canvas.clientWidth  || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }
    }
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncSize)
      : null;
    if (ro) ro.observe(canvas);
    syncSize();

    /* ── WebGL setup ── */
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    const VS = `
      attribute vec2 a_position;
      varying   vec2 v_uv;
      void main() {
        v_uv        = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;

    const FS = `
      precision highp float;
      varying vec2  v_uv;
      uniform float u_time;
      uniform vec2  u_resolution;
      uniform float u_progress;   /* 0..1 */
      uniform float u_direction;  /* 1=up (sender), -1=down (receiver) */
      uniform float u_active;     /* 0 or 1 */

      /* ─ orange #F97316 ─ */
      vec3 GOLD  = vec3(0.976, 0.451, 0.086);
      /* ─ line gray ─ */
      vec3 GRAY  = vec3(0.831, 0.816, 0.784);
      /* ─ background white ─ */
      vec3 BG    = vec3(0.980, 0.980, 0.973);

      void main() {
        vec2 fc = v_uv * u_resolution;

        /* ── centre-origin UV, aspect-corrected ── */
        vec2 uv  = (v_uv - 0.5) * 2.0;
        uv.x    *= u_resolution.x / u_resolution.y;

        float dist  = length(uv);
        float angle = atan(uv.y, uv.x);

        /* ── radiating lines ── */
        float numLines  = 90.0;
        float lineAlpha = step(0.985, abs(sin(angle * numLines)));

        /* fade a small hole at the centre */
        float hole = smoothstep(0.08, 0.20, dist);

        /* ── normalised y: 0=bottom 1=top ── */
        float normY = v_uv.y;   /* 0 at bottom, 1 at top in WebGL coords */

        /* ── progress boundary ── */
        /* sender  (direction=1 ): gold grows from bottom (normY < progress) */
        /* receiver(direction=-1): gold grows from top    (normY > 1-progress) */
        float boundary = (u_direction > 0.0)
          ? u_progress
          : 1.0 - u_progress;

        float inGold;
        if (u_direction > 0.0) {
          /* sender: below boundary = gold */
          inGold = 1.0 - smoothstep(boundary - 0.04, boundary + 0.04, normY);
        } else {
          /* receiver: above boundary = gold */
          inGold = smoothstep(boundary - 0.04, boundary + 0.04, normY);
        }

        /* ── flowing pulse ── */
        float flow = 0.0;
        if (u_active > 0.5) {
          /* wave moves in the direction of transfer */
          float wave = sin(normY * 18.0 - u_time * u_direction * 4.0);
          /* secondary wave for shimmer */
          float wave2 = sin(normY * 9.0  - u_time * u_direction * 2.5 + 1.2);
          flow = clamp((wave * 0.5 + wave2 * 0.3) * 0.6, 0.0, 1.0);

          /* confine pulse to the un-completed region */
          float inGray = 1.0 - inGold;
          flow *= inGray;
        }

        /* ── final line colour ── */
        float goldFrac = clamp(inGold + flow * 0.7, 0.0, 1.0);
        float activeMix = u_active;
        vec3  lineColor = mix(GRAY, mix(GRAY, GOLD, goldFrac), activeMix);

        /* ── alpha: subtle lines ── */
        float baseAlpha = 0.13;
        float goldAlpha = 0.60;
        float alpha = mix(baseAlpha, mix(baseAlpha, goldAlpha, goldFrac), activeMix);

        alpha *= lineAlpha * hole;

        gl_FragColor = vec4(lineColor, alpha);
      }`;

    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   VS));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    /* quad */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime      = gl.getUniformLocation(prog, 'u_time');
    const uRes       = gl.getUniformLocation(prog, 'u_resolution');
    const uProgress  = gl.getUniformLocation(prog, 'u_progress');
    const uDirection = gl.getUniformLocation(prog, 'u_direction');
    const uActive    = gl.getUniformLocation(prog, 'u_active');

    /* alpha blending */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let rafId;
    function render(t) {
      if (typeof ResizeObserver === 'undefined') syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const { isActive, progress, direction } = stateRef.current;
      if (uTime)      gl.uniform1f(uTime,      t * 0.001);
      if (uRes)       gl.uniform2f(uRes,        canvas.width, canvas.height);
      if (uProgress)  gl.uniform1f(uProgress,  progress / 100);
      if (uDirection) gl.uniform1f(uDirection, direction === 'up' ? 1.0 : -1.0);
      if (uActive)    gl.uniform1f(uActive,    isActive ? 1.0 : 0.0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width:  '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}
