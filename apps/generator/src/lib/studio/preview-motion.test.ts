import { describe, expect, it } from "vitest";
import { PreviewMotion } from "$lib/studio/preview-motion";

describe("preview presentation motion", () => {
  it("springs back after release and remains bounded after a suspended frame", () => {
    const motion = new PreviewMotion();
    const idle = new PreviewMotion();
    motion.drag(100, -100);
    for (let i = 0; i < 60; i++) { motion.step(1 / 60); idle.step(1 / 60); }
    motion.release();
    let overshot = false;
    let difference = 0;
    for (let i = 0; i < 60; i++) {
      difference = motion.step(1 / 60).y - idle.step(1 / 60).y;
      if (difference < 0) overshot = true;
    }
    expect(overshot).toBe(true);
    expect(Math.abs(difference)).toBeLessThan(0.00001);
    const resumed = motion.step(300);
    expect(Math.abs(resumed.x)).toBeLessThan(0.01);
    expect(Math.abs(resumed.y)).toBeLessThan(0.01);
    motion.reset();
    expect(motion.step(0)).toEqual({ x: 0, y: 0, lift: 0 });
  });
});
