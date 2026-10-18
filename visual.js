// Decorative motion never changes business data or navigation.
(() => {
  const scene = document.querySelector('.brand-scene');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!scene) return;
  let frame = 0;
  function update() {
    frame = 0;
    if (scene.hidden || motion.matches) {
      scene.style.removeProperty('--parallax-shift');
      return;
    }
    const bounds = scene.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > window.innerHeight) return;
    const shift = Math.max(-26, Math.min(26, -bounds.top * 0.16));
    scene.style.setProperty('--parallax-shift', `${shift.toFixed(2)}px`);
  }
  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('catalog-ready', schedule);
  motion.addEventListener('change', schedule);
  schedule();
})();
