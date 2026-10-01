<script lang="ts">
  let {
    values,
    tone = "text-primary",
    fill = "fill-primary/15",
  }: {
    /** Percentages, oldest first. Fewer than two points draws nothing. */
    values: number[];
    /** Text colour class for the line. */
    tone?: string;
    /** Fill class for the area under it. */
    fill?: string;
  } = $props();

  // A fixed viewBox in abstract units, stretched to whatever box it lands in.
  // The path then costs the same whether the panel is 300px wide or 1200, and
  // nothing has to be measured or observed — a resize observer per chart would be
  // more work than every path in the panel put together.
  const WIDTH = 100;
  const HEIGHT = 100;

  const line = $derived.by(() => {
    if (values.length < 2) return "";
    const step = WIDTH / (values.length - 1);
    return values
      .map((value, index) => {
        const x = index * step;
        // Clamped, because a reading is not guaranteed to be in range: a
        // percentage can arrive as 100.4 from a rounding driver.
        const y = HEIGHT - (Math.max(0, Math.min(100, value)) / 100) * HEIGHT;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  });

  const area = $derived(line ? `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z` : "");
</script>

<!--
  `preserveAspectRatio="none"` lets the drawing stretch to the box, and
  `non-scaling-stroke` keeps the line one pixel thick while it does — without it
  the stroke is stretched with the path and a wide chart gets a fat line.

  The figure is decoration: the number beside it is the accessible value, and this
  is marked hidden so a screen reader is not read a shape it cannot describe.
-->
<svg
  viewBox="0 0 {WIDTH} {HEIGHT}"
  preserveAspectRatio="none"
  class="block h-full w-full overflow-visible"
  aria-hidden="true"
>
  {#if area}
    <path d={area} class={fill} stroke="none" />
  {/if}
  {#if line}
    <path
      d={line}
      fill="none"
      class={tone}
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  {/if}
</svg>
