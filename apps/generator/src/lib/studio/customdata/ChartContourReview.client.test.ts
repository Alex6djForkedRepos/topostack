import { mount, tick, unmount, type Snippet } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChartContourReview from "./ChartContourReview.svelte";
import { draft, resetDraft } from "./chart-draft.svelte";
import { resetSession, reviewSourceKey } from "./chart-tracing.svelte";
import { reviewFixture, square } from "$lib/domain/testing/chart-review-fixture";

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const { review, request } = reviewFixture();
  draft.image = request.image;
  draft.units = "m";
  draft.lake = { id:"test",name:"Test lake",outline:request.lake.outline,spanKm:[1,1],footprint:1,distanceKm:0,clipped:false };
  draft.review = review;
  draft.reviewSourceKey = reviewSourceKey();
  draft.layersReviewedKey = "previous approval";
  target = document.createElement("div"); document.body.append(target);
  component = mount(ChartContourReview, {target,props:{previews:(() => {}) as unknown as Snippet}});
  await tick();
});
afterEach(async () => { await unmount(component); document.body.replaceChildren(); resetDraft(); resetSession(); vi.unstubAllGlobals(); });
const button = (text:string) => [...target.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()===text)!;
async function click(text:string) { const b=button(text); expect(b, text).toBeDefined(); b.click(); await tick(); }
async function choose(id:string) { const input=target.querySelector<HTMLSelectElement>('[aria-label="Select review contour"]')!; input.value=id; input.dispatchEvent(new Event("change",{bubbles:true})); await tick(); }
async function change(label:string,value:string,event="change") { const input=target.querySelector<HTMLInputElement|HTMLSelectElement>(`[aria-label="${label}"]`)!; input.value=value; input.dispatchEvent(new Event(event,{bubbles:true})); await tick(); }
async function key(value:string) { target.querySelector("[data-svg-viewport]")!.dispatchEvent(new KeyboardEvent("keydown",{key:value,bubbles:true})); await tick(); }

it("invalidates approvals when values or roles change and preserves edits through undo/redo", async () => {
  await choose("deep");
  await change("Contour printed value","7","input");
  expect(draft.review!.contours[2]).toMatchObject({value:7,confirmed:false});
  expect(draft.review!.alignmentConfirmed).toBe(false);
  expect(draft.layersReviewedKey).toBe("");
  await click("Undo edit"); expect(draft.review!.contours[2]!.value).toBe(10);
  await click("Redo edit"); expect(draft.review!.contours[2]!.value).toBe(7);
  await change("Contour interior","shallower");
  await change("Contour interior value","3","input");
  expect(draft.review!.contours[2]).toMatchObject({inside:"shallower",interiorValue:3});
  await change("Path type","island");
  expect(draft.review!.contours[2]!.interiorValue).toBeUndefined();
  expect(target.querySelector('[aria-label="Contour printed value"]')).toBeNull();
  await click("Confirm path and value"); expect(draft.review!.contours[2]!.confirmed).toBe(true);
  await click("Exclude stray path"); expect(draft.review!.contours[2]!.excluded).toBe(true);
  await click("Restore path"); expect(draft.review!.contours[2]!.excluded).toBe(false);
});

it("previews a visual join, rejects incompatible values, and joins without losing the source selection", async () => {
  draft.review!.contours.push({...square("a",10,5),closed:false,points:[[10,10],[20,10]]},{...square("b",20,9),closed:false,points:[[25,10],[30,10]]});
  await tick(); await choose("a"); await click("Join paths");
  const path=()=>target.querySelector<SVGElement>('path[role="button"][aria-label^="b,"]')!;
  path().dispatchEvent(new Event("pointerenter")); await tick();
  expect(target.textContent).toContain("same value");
  path().dispatchEvent(new MouseEvent("click",{bubbles:true})); await tick();
  expect(draft.review!.contours.find(c=>c.id==="b")!.excluded).toBe(false);
  await click("Cancel joining");
  await choose("b"); await change("Contour printed value","5","input"); await choose("a");
  await click("Join paths");
  path().dispatchEvent(new FocusEvent("focus")); await tick();
  expect(target.querySelector('[aria-label="Proposed endpoint connection"]')).not.toBeNull();
  path().dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})); await tick();
  expect(draft.review!.contours.find(c=>c.id==="a")!.points).toEqual([[10,10],[20,10],[25,10],[30,10]]);
  expect(draft.review!.contours.find(c=>c.id==="b")!.excluded).toBe(true);
  await click("Undo edit"); expect(draft.review!.contours.find(c=>c.id==="b")!.excluded).toBe(false);
  await click("Join paths"); window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"})); await tick();
  expect(button("Cancel joining")).toBeUndefined();
});

it("draws, repairs and removes alignment points using the editor controls", async () => {
  await click("Draw new contour"); await key("Enter"); await key("ArrowRight"); await key("ArrowRight"); await key("Enter"); await key("ArrowDown"); await key("ArrowDown"); await key("Enter");
  await click("Finish closed path");
  const added=draft.review!.contours.at(-1)!;
  expect(added).toMatchObject({closed:true,confirmed:false,points:[[0,0],[2,0],[2,2]]});
  await click("Insert midpoint after vertex"); expect(draft.review!.contours.at(-1)!.points).toHaveLength(4);
  await click("Remove vertex"); expect(draft.review!.contours.at(-1)!.points).toHaveLength(3);
  await click("Redraw selected path"); await key("Enter"); await click("Undo drawn vertex"); await click("Cancel drawing");
  expect(draft.review!.contours.at(-1)!.points).toHaveLength(3);
  await click("Alignment"); await click("Place alignment point"); await key("Enter");
  expect(draft.review!.controlPoints).toHaveLength(5);
  await change("Longitude 5","-80"); await change("Latitude 5","45");
  expect(draft.review!.controlPoints[4]).toMatchObject({lon:-80,lat:45});
  await click("Remove alignment point 5"); expect(draft.review!.controlPoints).toHaveLength(4);
});
