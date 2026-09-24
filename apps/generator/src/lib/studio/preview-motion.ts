/** Small presentation-only motion on the persistent 3D rig, never on geometry or the camera. */
export class PreviewMotion {
  private elapsed = 0;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private targetX = 0;
  private targetY = 0;

  drag(x: number, y: number): void {
    this.targetX = Math.max(-0.025, Math.min(0.025, y * 0.04));
    this.targetY = Math.max(-0.025, Math.min(0.025, x * 0.04));
  }
  release(): void { this.targetX = 0; this.targetY = 0; }
  reset(): void { this.elapsed = this.x = this.y = this.vx = this.vy = this.targetX = this.targetY = 0; }

  step(seconds: number): { x: number; y: number; lift: number } {
    // Fixed maximum integration step keeps the spring stable on slow frames;
    // tab suspension does not fast-forward the motion on return.
    const duration = Math.min(Math.max(seconds, 0), 0.25);
    this.elapsed += duration;
    let remaining = duration;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      this.vx += ((this.targetX - this.x) * 400 - this.vx * 26) * dt;
      this.vy += ((this.targetY - this.y) * 400 - this.vy * 26) * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      remaining -= dt;
    }
    return { x: this.x + Math.sin(this.elapsed * 0.41) * 0.003, y: this.y + Math.sin(this.elapsed * 0.29) * 0.003, lift: Math.sin(this.elapsed * 0.53) * 0.002 };
  }
}
