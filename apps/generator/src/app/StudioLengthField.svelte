<script lang="ts">
  import { Field } from "@loidolt/theme-svelte";
  import NumberField from "./StudioNumberField.svelte";

  /**
   * One length in display units, inside the sidebar's `.field-row` box.
   *
   * Every length field repeated the same three-part wiring: an `oninput` that
   * ignored an empty box, an `onValueChange` for stepper/drag/blur commits, and
   * a display-to-millimetre conversion with a no-op guard. `onCommit` receives
   * the shown value once per real change; the caller converts it.
   *
   * `label` is the control's accessible name and `fieldLabel` the visible one —
   * both suites pin these separately (`Field label="Material thickness"` over
   * `input[aria-label="Material"]`), so they stay independent.
   */
  let { label, fieldLabel = label, unit, value, min, max, step, disabled = false, onCommit }: {
    label: string;
    fieldLabel?: string;
    unit: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    onCommit: (shown: number) => void;
  } = $props();
</script>

<Field label={fieldLabel} class="field-row">{#snippet children({ id }: { id: string })}<span class="number-input"><NumberField {id} {label} {value} {min} {max} {step} {disabled} oninput={(event) => { if (event.currentTarget.value !== "") onCommit(event.currentTarget.valueAsNumber); }} onValueChange={onCommit} /><em>{unit}</em></span>{/snippet}</Field>
