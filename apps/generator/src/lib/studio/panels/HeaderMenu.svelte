<script lang="ts">
  // A small menu button for the studio header. The theme's DropdownMenu wraps
  // bits-ui, which the studio does not otherwise load; this keeps the header's
  // two menus out of the startup bundle while reusing the theme's menu styles.
  import { tick, type Snippet } from "svelte";

  interface Props {
    /** Accessible name of the trigger. */
    label: string;
    title?: string;
    triggerClass?: string;
    align?: "start" | "end";
    trigger: Snippet;
    /** Menu rows: elements with a `menuitem` role. Activating one closes the menu. */
    children: Snippet;
  }

  let { label, title, triggerClass = "", align = "end", trigger, children }: Props = $props();
  const id = $props.id();
  let open = $state(false);
  let root: HTMLElement;
  let button: HTMLButtonElement;
  let menu = $state<HTMLElement>();

  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];

  async function show(focus: "first" | "last") {
    open = true;
    await tick();
    const list = items();
    (focus === "first" ? list[0] : list.at(-1))?.focus();
  }

  function close(restoreFocus: boolean) {
    open = false;
    if (restoreFocus) button.focus();
  }

  function onTriggerKey(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    void show(event.key === "ArrowDown" ? "first" : "last");
  }

  function onMenuKey(event: KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.key === "Tab") close(false);
  }
</script>

<svelte:window onpointerdown={(event) => { if (open && !root.contains(event.target as Node)) close(false); }} />

<div class="header-menu" bind:this={root}>
  <button bind:this={button} type="button" class={triggerClass} aria-label={label} {title} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} onclick={() => open ? close(false) : void show("first")} onkeydown={onTriggerKey}>{@render trigger()}</button>
  {#if open}
    <div bind:this={menu} id={`${id}-menu`} class="ldt-menu header-menu__list" class:header-menu__list--start={align === "start"} role="menu" tabindex="-1" aria-label={label} onkeydown={onMenuKey} onclick={(event) => { if ((event.target as Element).closest('[role^="menuitem"]')) close(true); }}>
      {@render children()}
    </div>
  {/if}
</div>
