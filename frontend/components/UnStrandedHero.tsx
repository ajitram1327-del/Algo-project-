"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";

type UnStrandedHeroProps = {
  onEnter: () => void;
};

type Point = [number, number];

// Procedural multi-level seeded random generator
function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draw a realistic jagged electric bolt with 3-pass neon plasma glow
function drawElectricBolt(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  opacity: number,
  intensity = 1.0,
  roughness = 0.22,
) {
  const random = seededRandom(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);

  if (length < 2) return;

  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  const segments = Math.max(4, Math.min(22, Math.round(length / 15)));
  const points: Point[] = [[x1, y1]];

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const envelope = Math.sin(t * Math.PI);
    const jitter = (random() - 0.5) * length * roughness * envelope;

    points.push([
      x1 + dx * t + perpendicularX * jitter,
      y1 + dy * t + perpendicularY * jitter,
    ]);
  }

  points.push([x2, y2]);

  const strokePath = () => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
  };

  ctx.save();
  ctx.globalAlpha = Math.min(1, opacity);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Pass 1: Soft atmospheric electric aura
  ctx.shadowColor = "rgba(40, 130, 210, 0.35)";
  ctx.shadowBlur = 12 * intensity;
  ctx.strokeStyle = "rgba(40, 130, 210, 0.28)";
  ctx.lineWidth = 2.4 * intensity;
  strokePath();

  // Pass 2: Ice-cyan crisp arc
  ctx.shadowColor = "rgba(100, 220, 255, 0.55)";
  ctx.shadowBlur = 6 * intensity;
  ctx.strokeStyle = "rgba(130, 230, 255, 0.75)";
  ctx.lineWidth = 1.2 * intensity;
  strokePath();

  // Pass 3: Crisp white core
  ctx.shadowBlur = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 0.65 * intensity;
  strokePath();

  ctx.restore();
}

// Draw a branching lightning bolt with sub-branches (similar to the THUNDER reference)
function drawBranchingBolt(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  opacity: number,
  intensity = 1.0,
  maxBranches = 3,
) {
  drawElectricBolt(ctx, x1, y1, x2, y2, seed, opacity, intensity);

  const random = seededRandom(seed + 99);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const baseAngle = Math.atan2(dy, dx);
  const length = Math.hypot(dx, dy);

  const branches = Math.floor(random() * (maxBranches + 1));
  for (let b = 0; b < branches; b++) {
    const t = 0.25 + random() * 0.55;
    const branchStartX = x1 + dx * t;
    const branchStartY = y1 + dy * t;
    const branchAngle = baseAngle + (random() - 0.5) * 1.5;
    const branchLen = length * (0.25 + random() * 0.4);

    const branchEndX = branchStartX + Math.cos(branchAngle) * branchLen;
    const branchEndY = branchStartY + Math.sin(branchAngle) * branchLen;

    drawElectricBolt(
      ctx,
      branchStartX,
      branchStartY,
      branchEndX,
      branchEndY,
      seed + b * 23 + 7,
      opacity * 0.7,
      intensity * 0.75,
      0.3,
    );
  }
}

export default function UnStrandedHero({ onEnter }: UnStrandedHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const textEl = textRef.current;
    const ctx = canvas?.getContext("2d");

    if (!root || !canvas || !ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const pointer = { x: 0, y: 0, active: false };
    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let animationFrame = 0;
    let disposed = false;

    // Timing state for lightning strikes
    let nextMajorStrike = 0;
    let majorStrikeUntil = 0;
    let majorStrikeSeed = 100;

    const setCanvasSize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (reducedMotion) {
        drawReducedMotion();
      }
    };

    const drawReducedMotion = () => {
      if (!ctx || !textEl) return;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const rootRect = root.getBoundingClientRect();
      const textRect = textEl.getBoundingClientRect();
      const tx = textRect.left - rootRect.left;
      const ty = textRect.top - rootRect.top;
      const tw = textRect.width;
      const th = textRect.height;

      // Soft static glow around the text
      drawElectricBolt(ctx, tx - 20, ty + th * 0.5, tx + tw + 20, ty + th * 0.5, 42, 0.4, 0.8);
      drawElectricBolt(ctx, tx + tw * 0.8, ty - 60, tx + tw * 0.2, ty + th + 60, 99, 0.5, 1.0);
    };

    const animate = (now: number) => {
      if (disposed || !ctx) return;

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Get exact text position and dimensions inside the hero canvas
      const rootRect = root.getBoundingClientRect();
      const textRect = textEl ? textEl.getBoundingClientRect() : null;

      const tx = textRect ? textRect.left - rootRect.left : width * 0.25;
      const ty = textRect ? textRect.top - rootRect.top : height * 0.45;
      const tw = textRect ? textRect.width : width * 0.5;
      const th = textRect ? textRect.height : 80;

      const hoverMultiplier = isHovered ? 1.4 : 1.0;
      const frameSeed = Math.floor(now / 50); // updates arcs every ~50ms for realistic electric crackle

      // =========================================================================
      // 1. MAJOR DIAGONAL THUNDER BOLT (slashes across the word like the reference)
      // =========================================================================
      if (now > nextMajorStrike) {
        majorStrikeSeed = Math.floor(Math.random() * 100000);
        majorStrikeUntil = now + (isHovered ? 260 : 180);
        nextMajorStrike = now + (isHovered ? 400 + Math.random() * 800 : 900 + Math.random() * 1600);
      }

      if (now < majorStrikeUntil) {
        const strikeProgress = (majorStrikeUntil - now) / (isHovered ? 260 : 180);
        const strikeOpacity = Math.sin(strikeProgress * Math.PI) * 0.55;

        // Originates top-right above the word, slashes diagonally across down through the letters
        const startX = tx + tw * 0.95 + (Math.sin(now * 0.05) * 40);
        const startY = Math.max(0, ty - th * 2.2);
        const endX = tx + tw * 0.15 + (Math.cos(now * 0.04) * 30);
        const endY = Math.min(height, ty + th * 2.8);

        drawBranchingBolt(
          ctx,
          startX,
          startY,
          endX,
          endY,
          majorStrikeSeed,
          strikeOpacity,
          0.95 * hoverMultiplier,
          3,
        );

        // Subtle atmospheric flash on text during strike
        ctx.save();
        ctx.fillStyle = "rgba(100, 200, 240, 0.012)";
        ctx.fillRect(tx - 40, ty - 20, tw + 80, th + 40);
        ctx.restore();
      }

      // =========================================================================
      // 2. LETTER-CONTOUR VOLTAGE CRACKLING (crawling across each letter of UnStranded)
      // =========================================================================
      const numLetters = 10; // 'U','n','S','t','r','a','n','d','e','d'
      const letterWidth = tw / numLetters;

      for (let i = 0; i < numLetters; i++) {
        const lx = tx + i * letterWidth;
        const rand = seededRandom(frameSeed + i * 17);

        // Subtle jagged voltage arcing across the top of this letter
        if (rand() > (isHovered ? 0.25 : 0.45)) {
          const arcStartX = lx + rand() * (letterWidth * 0.4);
          const arcStartY = ty + rand() * (th * 0.35);
          const arcEndX = lx + letterWidth * (0.6 + rand() * 0.4);
          const arcEndY = ty + rand() * (th * 0.35);

          drawElectricBolt(
            ctx,
            arcStartX,
            arcStartY,
            arcEndX,
            arcEndY,
            frameSeed + i * 31,
            0.5,
            0.65 * hoverMultiplier,
            0.32,
          );
        }

        // Arcs crackling down through the center spine of the letter
        if (rand() > (isHovered ? 0.3 : 0.55)) {
          const spineTopX = lx + letterWidth * (0.3 + rand() * 0.4);
          const spineTopY = ty + rand() * (th * 0.2);
          const spineBottomX = lx + letterWidth * (0.3 + rand() * 0.4);
          const spineBottomY = ty + th * (0.8 + rand() * 0.2);

          drawElectricBolt(
            ctx,
            spineTopX,
            spineTopY,
            spineBottomX,
            spineBottomY,
            frameSeed + i * 47,
            0.45,
            0.6 * hoverMultiplier,
            0.36,
          );
        }

        // Sparks leaping from this letter to the adjacent letter (inter-character voltage jump)
        if (i < numLetters - 1 && rand() > (isHovered ? 0.35 : 0.65)) {
          const jumpStartX = lx + letterWidth * (0.7 + rand() * 0.3);
          const jumpStartY = ty + th * (0.2 + rand() * 0.6);
          const jumpEndX = lx + letterWidth * (1.1 + rand() * 0.4);
          const jumpEndY = ty + th * (0.2 + rand() * 0.6);

          drawElectricBolt(
            ctx,
            jumpStartX,
            jumpStartY,
            jumpEndX,
            jumpEndY,
            frameSeed + i * 71,
            0.55,
            0.75 * hoverMultiplier,
            0.25,
          );
        }

        // Tendrils shooting outwards from letter into the background (spiderweb discharge)
        if (rand() > (isHovered ? 0.5 : 0.75)) {
          const shootUp = rand() > 0.5;
          const originX = lx + letterWidth * rand();
          const originY = shootUp ? ty + 5 : ty + th - 5;
          const shootAngle = shootUp ? -Math.PI / 2 + (rand() - 0.5) * 1.6 : Math.PI / 2 + (rand() - 0.5) * 1.6;
          const shootLen = 30 + rand() * (isHovered ? 70 : 45);

          drawBranchingBolt(
            ctx,
            originX,
            originY,
            originX + Math.cos(shootAngle) * shootLen,
            originY + Math.sin(shootAngle) * shootLen,
            frameSeed + i * 89,
            0.4,
            0.55 * hoverMultiplier,
            2,
          );
        }
      }

      // =========================================================================
      // 3. CURSOR VOLTAGE ATTRACTION (Electricity arcs toward the mouse)
      // =========================================================================
      if (pointer.active) {
        const nearestLetterIdx = Math.max(
          0,
          Math.min(numLetters - 1, Math.floor((pointer.x - tx) / letterWidth)),
        );
        const anchorX = tx + (nearestLetterIdx + 0.5) * letterWidth;
        const anchorY = ty + th * 0.5;
        const dist = Math.hypot(pointer.x - anchorX, pointer.y - anchorY);

        if (dist < 400) {
          const cursorOpacity = Math.max(0.1, (1 - dist / 400) * 0.55);
          drawBranchingBolt(
            ctx,
            anchorX,
            anchorY,
            pointer.x,
            pointer.y,
            frameSeed + 999,
            cursorOpacity,
            0.8,
            2,
          );
        }
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
      if (reducedMotion) drawReducedMotion();
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else if (!reducedMotion && !animationFrame) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    pointer.x = window.innerWidth / 2;
    pointer.y = window.innerHeight / 2;

    setCanvasSize();

    const resizeObserver = new ResizeObserver(setCanvasSize);
    resizeObserver.observe(root);

    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!reducedMotion) {
      animationFrame = window.requestAnimationFrame(animate);
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isHovered]);

  return (
    <main ref={rootRef} className="us-hero">
      <canvas
        ref={canvasRef}
        className="us-hero__electricity"
        aria-hidden="true"
      />

      <div className="us-hero__topline" aria-hidden="true">
        <span className="us-hero__status-dot" />
        HIGH VOLTAGE ROUTE PLANNING
      </div>

      <section className="us-hero__content" aria-label="UnStranded">
        <p className="us-hero__eyebrow">YOUR NEXT CHARGE STARTS HERE</p>

        <button
          className="us-brand-button"
          type="button"
          onClick={onEnter}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          aria-label="Open the UnStranded EV route calculator"
        >
          <span className="us-brand-button__mark" aria-hidden="true">
            <Zap size={25} strokeWidth={2.4} />
          </span>
          <span ref={textRef} className="us-brand-button__name">
            UnStranded
          </span>
          <span className="us-brand-button__arrow" aria-hidden="true">
            ↗
          </span>
        </button>

        <p className="us-hero__tagline">
          Go farther. Know your charge.
        </p>

        <p className="us-hero__hint">
          Select the name to plan your journey
        </p>
      </section>

      <div className="us-hero__footer" aria-hidden="true">
        <span>ROUTE</span>
        <span className="us-hero__footer-line" />
        <span>ENERGY</span>
        <span className="us-hero__footer-line" />
        <span>UNCHAINED</span>
      </div>
    </main>
  );
}
