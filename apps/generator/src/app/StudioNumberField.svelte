<script lang="ts">
  import { getContext } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { NumberField } from "@loidolt/theme-svelte";
  let { value = 0, min = -Infinity, max = Infinity, step = 1, label, disabled = false, boxed = false, onValueChange, oninput, ...rest }: Pick<HTMLInputAttributes, "id" | "oninput" | "aria-describedby"> & {
    value?: number; min?: number; max?: number; step?: number; label: string; disabled?: boolean; boxed?: boolean; onValueChange?: (value: number) => void;
  } = $props();
  const isEmbedded = getContext<() => boolean>("atomm-embedded") ?? (() => false);
  let drag: { x: number; value: number; moved: boolean; direction: number } | undefined;
  function commit(next: number) {
    if (!Number.isFinite(next)) return;
    onValueChange?.(Math.min(max, Math.max(min, Number(next.toFixed(6)))));
  }
  function input(event: Event & { currentTarget: HTMLInputElement }) {
    // Partial numbers are editing states, never geometry values. Custom input
    // handlers obey the same bounds as drag and stepper commits.
    const field = event.currentTarget;
    if (field.value === "" || !Number.isFinite(field.valueAsNumber)) return;
    const next = Math.min(max, Math.max(min, field.valueAsNumber));
    if (next !== field.valueAsNumber) field.value = String(next);
    if (oninput) oninput(event);
    else commit(next);
  }
  function finishInput(event: FocusEvent & { currentTarget: HTMLInputElement }) {
    const field = event.currentTarget;
    field.value = String(Number.isFinite(field.valueAsNumber) ? Math.min(max, Math.max(min, field.valueAsNumber)) : value);
    commit(field.valueAsNumber);
  }
  function start(event: PointerEvent & { currentTarget: HTMLInputElement }) {
    if (disabled || event.button !== 0 || event.pointerType === "touch" || document.activeElement === event.currentTarget) return;
    drag = { x: event.clientX, value, moved: false, direction: getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent & { currentTarget: HTMLInputElement }) {
    if (!drag) return;
    const distance = (event.clientX - drag.x) * drag.direction;
    if (!drag.moved && Math.abs(distance) < 3) return;
    drag.moved = true;
    event.preventDefault();
    commit(drag.value + Math.round(distance / 3) * step * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1));
  }
  function finish(event: PointerEvent & { currentTarget: HTMLInputElement }) {
    if (drag?.moved) event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag = undefined;
  }
</script>

{#if isEmbedded()}
  <input class="atomm-number" type="number" inputmode="decimal" aria-label={label} {value} {disabled} min={Number.isFinite(min) ? min : undefined} max={Number.isFinite(max) ? max : undefined} {step} {...rest} oninput={input} onchange={(event) => commit(event.currentTarget.valueAsNumber)} onblur={finishInput} onpointerdown={start} onpointermove={move} onpointerup={finish} onpointercancel={finish} onkeydown={(event) => { if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); commit(value + step * 10 * (event.key === "ArrowUp" ? 1 : -1)); } }} />
{:else}
  <NumberField {boxed} {value} {min} {max} {step} {label} {disabled} {onValueChange} {oninput} {...rest} />
{/if}
