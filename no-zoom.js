// Prevent accidental pinch/double-tap zoom on touch devices.
(() => {
  for (const type of ['gesturestart','gesturechange','gestureend']) {
    document.addEventListener(type,event=>event.preventDefault(),{passive:false});
  }
  document.addEventListener('touchmove',event=>{
    if(event.touches.length>1)event.preventDefault();
  },{passive:false});
})();
