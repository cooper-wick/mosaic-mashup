import { MAX_SEEDS, MAX_PALETTE_SIZE } from "../utils/constants.ts";

export const UNWEIGHTED_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_st;
uniform int u_sc;
uniform vec2 u_res;
uniform vec3 u_pal[${MAX_PALETTE_SIZE}];
uniform int u_ps;
uniform int u_rid;
uniform vec2 u_off;
uniform vec2 u_cs;
uniform float u_gs;
uniform float u_aa;
out vec4 o;
void main(){
vec2 p=gl_FragCoord.xy;p.y=u_res.y-p.y;
vec2 l=p-u_off;
if(l.x<0.||l.x>u_cs.x||l.y<0.||l.y>u_cs.y)discard;
float md=1e10;
int ci=-1;
vec2 csp=vec2(0.);
for(int i=0;i<${MAX_SEEDS};i++){
if(i>=u_sc)break;
vec4 s=texelFetch(u_st,ivec2(i,0),0);
float d=distance(l,s.xy);
if(d<md){md=d;ci=i;csp=s.xy;}
}
float med=1e10;
for(int i=0;i<${MAX_SEEDS};i++){
if(i>=u_sc)break;
if(i==ci)continue;
vec4 s=texelFetch(u_st,ivec2(i,0),0);
vec2 n=s.xy;
vec2 tn=n-csp;
float db=dot(csp+tn*.5-l,normalize(tn));
med=min(med,db);
}
if(ci==-1||u_sc<=1)med=1e3;
if(u_rid==1){
if(ci==-1)o=vec4(0.);
else{
float r=float(ci&255)/255.;
float g=float((ci>>8)&255)/255.;
float b=float((ci>>16)&255)/255.;
o=vec4(r,g,b,1.);
}
return;
}
vec4 cs=texelFetch(u_st,ivec2(ci,0),0);
float rv=cs.w;
int cidx=clamp(int(floor(rv)),0,max(u_ps-1,0));
float hf=step(.05,fract(rv));
vec3 bc=u_pal[cidx];
float ld=dot(normalize(l-csp),normalize(vec2(-1.)));
float hg=u_gs*.25;
if(hf>.5){
float lum=dot(bc,vec3(.299,.587,.114));
bc=bc*mix(.85,.6,lum)+vec3(mix(.25,0.,lum));
float is=smoothstep(0.,12.,med-hg);
bc*=mix(mix(.75,.55,lum),1.,is);
float bs=mix(.15,-.08,ld*.5+.5)*smoothstep(8.,0.,med-hg);
bc+=bc*bs;
float or=1.-smoothstep(0.,1.8,abs(med-(hg+3.)));
bc=mix(bc,mix(vec3(.75),vec3(0.),step(.45,lum)),or*.55);
bc=mix(bc,vec3(dot(bc,vec3(.299,.587,.114))),.15);
}
float ef=smoothstep(hg,hg+u_aa,med);
o=vec4(clamp(mix(mix(vec3(.08),vec3(.15,.15,.2),hf),bc,ef),0.,1.),1.);
}`;
