// src/components/AnimatedLogo.tsx
import { motion, useAnimation } from "framer-motion";
import Image from "next/image";
import { useCallback, useRef } from "react";

type Props = {
  width?: number;        // العرض بالبكسل
  height?: number;       // الارتفاع (اختياري) — لو ما اتبعتش يتحسب تلقائي
  glow?: boolean;        // هل نضيف توهج/ظل لطيف
  pulse?: boolean;       // نبض خفيف
  shine?: boolean;       // وميض عابر
  className?: string;    // كلاس إضافي
};

export default function AnimatedLogo({
  width = 220,
  height,
  glow = true,
  pulse = true,
  shine = true,
  className = "",
}: Props) {
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;   // 0..1
    const py = (e.clientY - rect.top) / rect.height;   // 0..1

    // زاوية ميل خفيفة عشان إحساس 3D
    const rotateY = (px - 0.5) * 16; // -8deg..+8deg
    const rotateX = (0.5 - py) * 12; // -6deg..+6deg
    controls.start({ rotateX, rotateY, transition: { type: "spring", stiffness: 180, damping: 18 } });
  }, [controls]);

  const onMouseLeave = useCallback(() => {
    controls.start({ rotateX: 0, rotateY: 0, transition: { type: "spring", stiffness: 180, damping: 18 } });
  }, [controls]);

  const h = height ?? Math.round((width * 3) / 4); // تقدير ارتفاع افتراضي لو الشعار أفقي

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, scale: 0.85, rotateX: 0, rotateY: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.04 }}
      className={`relative select-none [transform-style:preserve-3d] ${className}`}
      style={{ perspective: 800 }}
    >
      {/* توهج خلفي اختياري */}
      {glow && (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-3xl blur-2xl"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,0.25), rgba(16,185,129,0.0))",
          }}
        />
      )}

      {/* حاوية ميل/دوران */}
      <motion.div animate={controls} className="rounded-2xl will-change-transform">
        {/* نبض اختياري */}
        <motion.div
          animate={pulse ? { scale: [1, 1.01, 1] } : undefined}
          transition={pulse ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : undefined}
          className="relative inline-block"
          style={{ width, height: h }}
        >
          <Image
            src="/logo.png"
            alt="Logo"
            width={width}
            height={h}
            priority
            className="rounded-xl object-contain"
          />

          {/* وميض عابر */}
          {shine && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl"
              initial={{ x: "-120%" }}
              whileHover={{ x: "120%" }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              style={{
                background:
                  "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.5) 20%, transparent 40%)",
                mixBlendMode: "overlay",
              }}
            />
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
