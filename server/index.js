import express from 'express';
import 'dotenv/config';
import {filterRelevantPlaces} from './place-relevance.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=express();
app.use(express.json({limit:'20kb'}));
const meals=JSON.parse(await readFile(new URL('./data/menus.json',import.meta.url),'utf8'));
const categories=['전체 랜덤',...new Set(meals.map(m=>m.category))];
const emojis=Object.fromEntries(meals.map(m=>[m.category,m.emoji]));emojis['전체 랜덤']='🎲';
const allowedModes=['상관없음','방문','배달'];
const ageGroups=['전체 연령', '10대', '20대', '30~40대', '50대 이상'];
function validFilters(f={}) {return {ageGroup:ageGroups.includes(f.ageGroup)?f.ageGroup:'전체 연령',category:typeof f.category==='string'&&categories.includes(f.category)?f.category:'전체 랜덤',budget:[0,10000,15000,20000].includes(f.budget)?f.budget:0,spice:[0,1,2,3].includes(f.spice)?f.spice:3,portion:['상관없음','가볍게','든든하게'].includes(f.portion)?f.portion:'상관없음',mode:allowedModes.includes(f.mode)?f.mode:'상관없음'};}
function validIds(ids){return Array.isArray(ids)?ids.filter(x=>Number.isInteger(x)).slice(0,300):[];}
function matches(f,excluded){return meals.filter(m=>(f.ageGroup==='전체 연령'||m.ageGroups.includes(f.ageGroup))&&(f.category==='전체 랜덤'||m.category===f.category)&&(!f.budget||m.price<=f.budget)&&m.spice<=f.spice&&(f.portion==='상관없음'||m.portion===f.portion)&&!excluded.includes(m.id));}
app.get('/api/health',(_req,res)=>res.json({ok:true,menuCount:meals.length}));
app.get('/api/categories',(_req,res)=>res.json({categories,categoryEmojis:emojis,ageGroups}));
app.get('/api/menus',(_req,res)=>res.json({menus:meals}));
app.post('/api/recommend/count',(req,res)=>{const f=validFilters(req.body?.filters);res.json({count:matches(f,validIds(req.body?.excluded)).length});});
app.post('/api/recommend',(req,res)=>{const f=validFilters(req.body?.filters);const excluded=validIds(req.body?.excluded);const seen=validIds(req.body?.seen);const eligible=matches(f,excluded);if(!eligible.length)return res.status(404).json({error:'조건에 맞는 메뉴가 없어요. 조건을 완화해 주세요.'});// Exclude the last 30 actual recommendations, not the last 30 unique menu IDs.
// When a narrow filter exhausts its choices, release the oldest history entries
// only as much as needed to keep the recommendation button usable.
const recent=seen.slice(-30);
let pool=eligible.filter(m=>!recent.includes(m.id));
if(!pool.length){
  for(let release=1;release<=recent.length;release++){
    const blocked=recent.slice(release);
    pool=eligible.filter(m=>!blocked.includes(m.id));
    if(pool.length)break;
  }
}
const meal=pool[Math.floor(Math.random()*pool.length)];res.json({meal,eligibleCount:eligible.length});});

// Kakao REST key remains on the server. Never send it to React.
const kakaoKey=(process.env.KAKAO_REST_API_KEY||'').trim();
function validKakaoKey(key){return /^[\x21-\x7E]+$/.test(key)&&!key.includes('여기에')&&!key.includes('입력하세요');}
async function kakao(path,params){
  if(!kakaoKey||!validKakaoKey(kakaoKey)){const e=new Error('카카오 REST API 키가 비어 있거나 올바르지 않습니다. 프로젝트 루트 .env의 KAKAO_REST_API_KEY를 실제 영문·숫자 키로 바꾸고 서버를 재시작해 주세요.');e.status=503;throw e;}
  const url=new URL('https://dapi.kakao.com'+path);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{headers:{Authorization:`KakaoAK ${kakaoKey}`},signal:controller.signal});
    if(!r.ok){const e=new Error(r.status===401||r.status===403?'카카오 API 인증에 실패했습니다. 키와 서비스 사용 설정을 확인해 주세요.':`카카오 API 요청 실패 (${r.status})`);e.status=502;throw e;}
    return await r.json();
  }finally{clearTimeout(timer);}
}
function coords(lat,lng){const a=Number(lat),b=Number(lng);return Number.isFinite(a)&&a>=-90&&a<=90&&Number.isFinite(b)&&b>=-180&&b<=180?{lat:a,lng:b}:null;}
// Broader terms are only used when the visitor explicitly requests related places.
function relatedKeyword(menu){
  const name=menu.name;
  const groups=[
    [/샌드위치|토스트|베이글|파니니|랩/, '샌드위치'],
    [/샐러드|포케|포케볼/, '샐러드'],
    [/피자/, '피자'], [/파스타|스파게티|알리오|까르보나라/, '파스타'],
    [/리조또/, '이탈리안 레스토랑'], [/타코|퀘사디아|부리토|나초/, '멕시칸 음식점'],
    [/햄버거|버거/, '햄버거'], [/핫도그/, '핫도그'],
    [/치킨|닭강정/, '치킨'], [/초밥|스시|사시미/, '초밥'],
    [/라멘|우동|소바/, '일식'], [/국밥/, '국밥'],
    [/찌개|전골/, '한식'], [/스테이크/, '스테이크']
  ];
  for(const [pattern,keyword] of groups)if(pattern.test(name))return keyword;
  const categoryTerms={'한식':'한식','일식':'일식','중식':'중식','양식':'양식','패스트푸드':'패스트푸드','분식':'분식','아시안':'아시아 음식점','디저트':'카페','샐러드':'샐러드'};
  return categoryTerms[menu.category]||menu.category;
}
app.get('/api/places',async(req,res)=>{
  const keyword=typeof req.query.menu==='string'?req.query.menu.trim():'';
  const c=coords(req.query.lat,req.query.lng);
  if(!keyword||keyword.length>50||!c)return res.status(400).json({error:'메뉴명과 올바른 위도·경도가 필요합니다.'});
  const radius=Math.min(20000,Math.max(100,Number(req.query.radius)||3000));
  const related=req.query.related==='1';
  const matched=meals.find(m=>m.name===keyword);
  if(related&&!matched)return res.status(400).json({error:'추천 메뉴에서만 관련 음식점을 검색할 수 있어요.'});
  const searchTerm=related?relatedKeyword(matched):keyword;
  try{
    const data=await kakao('/v2/local/search/keyword.json',{query:searchTerm,x:c.lng,y:c.lat,radius,sort:'distance',size:15});
    const filtered=filterRelevantPlaces(keyword,data.documents||[]);
    res.json({query:searchTerm,related,center:c,places:filtered.map(p=>({id:p.id,name:p.place_name,address:p.road_address_name||p.address_name,phone:p.phone||'',distance:p.distance?Number(p.distance):null,category:p.category_name,url:p.place_url,lat:Number(p.y),lng:Number(p.x)})),note:'키워드 검색 결과이며 해당 메뉴의 실제 판매 여부와 배달 가능 여부는 확인되지 않았습니다.'});
  }catch(e){res.status(e.status||502).json({error:e.name==='AbortError'?'카카오 API 응답 시간이 초과되었습니다.':e.message||'장소 검색 실패'});}
});
app.get('/api/geocode',async(req,res)=>{
  const address=typeof req.query.address==='string'?req.query.address.trim():'';
  if(address.length<2||address.length>100)return res.status(400).json({error:'지역명 또는 주소를 2~100자로 입력해 주세요.'});
  try{
    const data=await kakao('/v2/local/search/keyword.json',{query:address,size:1});
    const p=data.documents?.[0];
    if(!p)return res.status(404).json({error:'해당 지역을 찾지 못했습니다. 역이나 주요 장소 이름을 입력해 주세요.'});
    res.json({name:p.place_name,address:p.road_address_name||p.address_name,lat:Number(p.y),lng:Number(p.x)});
  }catch(e){res.status(e.status||502).json({error:e.name==='AbortError'?'지역 검색 시간이 초과되었습니다.':e.message||'지역 검색 실패'});}
});

// Serve the built React app on Render and other single-service deployments.
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const distPath=path.resolve(__dirname,'../dist');
app.use(express.static(distPath));
app.get('*',(req,res,next)=>{
 if(req.path.startsWith('/api/'))return res.status(404).json({error:'존재하지 않는 API입니다.'});
 res.sendFile(path.join(distPath,'index.html'),err=>{if(err)next(err)});
});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'서버 오류가 발생했습니다.'})});
const port=Number(process.env.PORT)||3001;
app.listen(port,'0.0.0.0',()=>console.log(`Server running on port ${port}`));
