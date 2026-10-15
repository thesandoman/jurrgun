/**
 * A tiny motion kit for gestures (the deck, the map's events sheet), after
 * Apple's "Designing Fluid Interfaces" (see the apple-design skill):
 *
 *  - spring(): a damped spring in Apple's two designer terms, damping ratio
 *    (1 = no overshoot, 0.8 = a little bounce after a flick) and response
 *    (seconds, how quickly it gets there). It starts from where the element
 *    is right now and from the finger's velocity, and stop() hands back the
 *    live value and velocity, so any motion can be grabbed mid-flight.
 *  - tracker(): release velocity from the last ~100 ms of pointer moves.
 *  - project(): where a flick is heading (Apple's exponential decay), so we
 *    snap to the target nearest the projected point, not the release point.
 *  - rubberband(): soft resistance past an edge instead of a hard stop.
 *  - still(): reduced motion (the OS setting or our Accessibility menu).
 *
 * No library: a classic script that sets window.jgMotion, loaded in <head>.
 */
export const SPRING_JS = `window.jgMotion=(function(){
function spring(o){var x=o.from,v=o.velocity||0,to=o.to,r=o.response||0.35,d=o.damping==null?1:o.damping;
var k=Math.pow(2*Math.PI/r,2),c=4*Math.PI*d/r,last=performance.now(),id=0,live=true;
function step(now){var dt=Math.min(0.064,(now-last)/1000);last=now;var n=Math.max(1,Math.ceil(dt/0.004)),h=dt/n;
for(var i=0;i<n;i++){var a=-k*(x-to)-c*v;v+=a*h;x+=v*h}
if(Math.abs(v)<4&&Math.abs(x-to)<0.4){x=to;v=0;live=false;o.onUpdate(x,0);if(o.onDone)o.onDone();return}
o.onUpdate(x,v);id=requestAnimationFrame(step)}
id=requestAnimationFrame(step);
return{stop:function(){cancelAnimationFrame(id);live=false;return{x:x,v:v}},retarget:function(t){to=t},get live(){return live}}}
function tracker(){var s=[];return{add:function(p){var t=performance.now();s.push([p,t]);while(s.length>2&&t-s[0][1]>100)s.shift()},
velocity:function(){if(s.length<2)return 0;var a=s[0],b=s[s.length-1],dt=(b[1]-a[1])/1000;return dt>0?(b[0]-a[0])/dt:0},reset:function(){s=[]}}}
function project(v,rate){rate=rate||0.99;return(v/1000)*rate/(1-rate)}
function rubberband(over,dim,c){c=c||0.55;return(over*dim*c)/(dim+c*Math.abs(over))}
function still(){return matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.classList.contains("a11y-motion")}
function tick(){try{if(navigator.vibrate&&!still())navigator.vibrate(8)}catch(e){}}
return{spring:spring,tracker:tracker,project:project,rubberband:rubberband,still:still,tick:tick}})();`;
