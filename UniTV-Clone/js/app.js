/* UniTV clone — app.js (M76-safe). Catálogo real (EPG) + navegação por controle + AVPlay. */
(function () {
  var B = window.beacon || function(){};
  B("app", "start");
  var PLACEHOLDER_STREAM = "http://192.168.0.19:8080/live/live.m3u8"; // relay ao vivo do engine
  var chans = (window.CATALOG && CATALOG.channels) ? CATALOG.channels : [];
  var AV = (window.webapis && webapis.avplay) ? webapis.avplay : null;
  var WINDOW = 9;

  var zone = 'chan';   // 'tabs' | 'chan'
  var ci = 0, top = 0, ti = 0, playing = false;

  function $(id){ return document.getElementById(id); }
  function pad(n){ return (n<10?'0':'')+n; }
  function nowHMS(){ var d=new Date(); return pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds()); }
  function hms(t){ t=t||''; return t.length>=14 ? t.substring(8,14) : ''; }
  function hhmm(t){ var h=hms(t); return h ? h.substring(0,2)+':'+h.substring(2,4) : ''; }
  function esc(s){ s=String(s==null?'':s); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function toast(m){ var t=$('toast'); if(!t)return; t.innerHTML=esc(m); t.className='show'; clearTimeout(t._t); t._t=setTimeout(function(){t.className='';},1800); }
  function initials(name){ var w=String(name).replace(/[^A-Za-z0-9 ]/g,'').split(/\s+/); var s=''; for(var i=0;i<w.length&&s.length<3;i++){ if(w[i]) s+=w[i].charAt(0); } return s.toUpperCase()||'TV'; }

  function nowProg(epg){
    if(!epg||!epg.length) return 0;
    var n=nowHMS();
    for(var i=0;i<epg.length;i++){
      var s=hms(epg[i].s), e=hms(epg[i].e); if(!s||!e) continue;
      if(e>s){ if(n>=s && n<e) return i; } else { if(n>=s || n<e) return i; }
    }
    return 0;
  }
  function progPct(p){
    if(!p) return 0; var s=hms(p.s), e=hms(p.e), n=nowHMS(); if(!s||!e) return 0;
    function sec(x){ return (+x.substring(0,2))*3600+(+x.substring(2,4))*60+(+x.substring(4,6)); }
    var S=sec(s),E=sec(e),N=sec(n); if(E<=S)E+=86400; if(N<S)N+=86400;
    var pct=Math.round((N-S)/(E-S)*100); return pct<0?0:(pct>100?100:pct);
  }

  /* ---------- lista de canais (janela) ---------- */
  function renderList(){
    var wrap=$('chanlist'); if(!wrap) return;
    var html='', end=Math.min(chans.length, top+WINDOW);
    for(var i=top;i<end;i++){
      var ch=chans[i]; var idx=nowProg(ch.epg); var now=(ch.epg[idx]?ch.epg[idx].n:'')||'';
      html+='<div class="chan'+(i===ci?' focused':'')+'">'+
        '<div class="logo">'+esc(initials(ch.name))+'</div>'+
        '<div class="num">'+ch.num+'</div>'+
        '<div class="meta"><div class="nm">'+esc(ch.name)+'</div>'+
        '<div class="now">'+(now?esc(now):'—')+'</div></div></div>';
    }
    wrap.innerHTML=html;
  }
  function renderPreview(){
    var ch=chans[ci]; var pv=$('preview'); if(!ch||!pv) return;
    var idx=nowProg(ch.epg); var p=ch.epg[idx]||null;
    var rows='', end=Math.min(ch.epg.length, idx+7);
    for(var k=idx;k<end;k++){ var pr=ch.epg[k];
      rows+='<div class="row'+(k===idx?' on':'')+'"><b>'+hhmm(pr.s)+'</b>'+esc(pr.n)+'</div>'; }
    pv.innerHTML='<div class="pv-hero">'+
      '<span class="pv-badge">● AO VIVO</span>'+
      '<div class="pv-title">'+esc(ch.name)+'</div>'+
      '<div class="pv-now">'+(p?esc(p.n):'Programação')+'</div>'+
      '<div class="pv-time">'+(p?hhmm(p.s)+' – '+hhmm(p.e):'')+'</div>'+
      '<div class="pv-bar"><i style="width:'+progPct(p)+'%"></i></div>'+
      '<div class="pv-epg">'+rows+'</div></div>';
  }
  function refreshChan(){
    if(ci<top) top=ci;
    if(ci>top+WINDOW-1) top=ci-WINDOW+1;
    if(top<0) top=0;
    renderList(); renderPreview();
  }

  /* ---------- abas ---------- */
  var TABS=['LIVE','MATCH','FEATURED','MOVIES','SERIES','KIDS','ANIME','EXPLORE'];
  function tabEls(){ return document.getElementsByClassName('tab'); }
  function setTab(name){
    var els=tabEls();
    for(var i=0;i<els.length;i++){ els[i].className='tab'+(els[i].getAttribute('data-tab')===name?' active':'')+(els[i].getAttribute('data-tab')==='KIDS'?' kids':''); }
    var live=(name==='LIVE');
    $('liveView').style.display=live?'block':'none';
    $('soonView').style.display=live?'none':'block';
    if(!live){ $('soonTitle').textContent=name; }
  }
  function focusTabs(){
    var els=tabEls();
    for(var i=0;i<els.length;i++){
      var base='tab'+(els[i].getAttribute('data-tab')===TABS[ti]?' active':'')+(els[i].getAttribute('data-tab')==='KIDS'?' kids':'');
      els[i].className=base+(zone==='tabs'&&i===ti?' focused':'');
    }
  }

  /* ---------- player ---------- */
  function openPlayer(ch){
    if(!AV){ toast('Player indisponível'); return; }
    try{
      try{AV.close();}catch(e){}
      AV.open(PLACEHOLDER_STREAM); AV.setDisplayRect(0,0,1920,1080);
      AV.setListener({ onerror:function(err){ toast('Erro: '+err); },
        onstreamcompleted:function(){ try{AV.seekTo(0);AV.play();}catch(e){} } });
      AV.prepareAsync(function(){ try{AV.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');}catch(e){}
        AV.play(); document.body.className='playing'; playing=true; toast('▶ AO VIVO — '+ch.name);
      }, function(err){ toast('prepare: '+err); });
    }catch(e){ toast(''+e); }
  }
  function closePlayer(){ try{AV.stop();AV.close();}catch(e){} document.body.className=''; playing=false; }
  function openUrl(url, name){
    if(!AV){ toast('Player indisponível'); return; }
    try{ try{AV.close();}catch(e){}
      AV.open(url); AV.setDisplayRect(0,0,1920,1080);
      AV.setListener({ onerror:function(err){ toast('Erro: '+err); } });
      AV.prepareAsync(function(){ try{AV.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');}catch(e){}
        AV.play(); document.body.className='playing'; playing=true; toast('▶ '+name);
      }, function(err){ toast('prepare: '+err); });
    }catch(e){ toast(''+e); }
  }

  /* ---------- busca (VOD via motor) ---------- */
  var SRV="http://192.168.0.19:8080";
  var searchOpen=false, sQ="", KB=[], kf=0, KCOLS=6, sresu=[], sf=0, RCOLS=4, szone="kbd";
  function updateTop(){ var s=$('icSearch'); if(s) s.className='ic'+(zone==='top'?' focused':''); }
  function buildKB(){ KB=[];
    for(var i=0;i<26;i++) KB.push({l:String.fromCharCode(65+i), v:String.fromCharCode(97+i)});
    KB.push({l:'espaço',v:' ',w:true}); KB.push({l:'⌫',v:'DEL'}); KB.push({l:'BUSCAR',v:'GO',w:true});
  }
  function renderKB(){ var h='';
    for(var i=0;i<KB.length;i++){ var k=KB[i];
      h+='<span class="key'+(k.w?' wide':'')+(szone==='kbd'&&i===kf?' focused':'')+'">'+esc(k.l)+'</span>'; }
    $('kbd').innerHTML=h;
  }
  function updField(){ var e=$('sq').getElementsByClassName('sqtext')[0]; if(e) e.textContent=sQ||'busque um filme ou série'; }
  function renderRes(){ var h='';
    for(var i=0;i<sresu.length;i++){ var r=sresu[i];
      h+='<div class="rtile'+(szone==='res'&&i===sf?' focused':'')+'"><div class="rt">'+esc(r.title)+'</div><div class="rr">▶ assistir</div></div>'; }
    $('sres').innerHTML=h||'<div style="color:#fff;font-size:24px;padding:20px">—</div>';
  }
  function openSearch(){ searchOpen=true;
    $('liveView').style.display='none'; $('soonView').style.display='none'; $('searchView').style.display='block';
    if(!KB.length) buildKB(); szone='kbd'; kf=0; renderKB(); updField(); renderRes();
    $('sstatus').textContent='Digite e aperte BUSCAR';
  }
  function closeSearch(){ searchOpen=false; $('searchView').style.display='none'; zone='tabs'; setTab('LIVE'); focusTabs(); updateTop(); }
  function pressKey(k){ if(k.v==='GO') return doSearch();
    if(k.v==='DEL') sQ=sQ.slice(0,-1); else sQ+=k.v; updField(); }
  function doSearch(){ if(!sQ.replace(/\s/g,'')){ $('sstatus').textContent='Digite algo primeiro'; return; }
    $('sstatus').textContent='Buscando "'+sQ+'" na sua conta…'; sresu=[]; $('sres').innerHTML='';
    var x=new XMLHttpRequest(); x.open('GET', SRV+'/search?q='+encodeURIComponent(sQ), true); x.timeout=45000;
    x.onreadystatechange=function(){ if(x.readyState!==4) return;
      if(x.status===200){ try{ var d=JSON.parse(x.responseText); sresu=d.results||[];
        $('sstatus').textContent=sresu.length+' resultado(s) — ◀▶▲▼ escolhe, Enter assiste, Voltar volta ao teclado';
        szone='res'; sf=0; renderRes(); renderKB();
      }catch(e){ $('sstatus').textContent='Erro lendo resultados'; } }
      else $('sstatus').textContent='Erro na busca ('+x.status+')'; };
    x.onerror=function(){ $('sstatus').textContent='Sem resposta do controlador (PC ligado?)'; };
    x.ontimeout=function(){ $('sstatus').textContent='Busca demorou demais'; };
    x.send();
  }
  function selectResult(r){ $('sstatus').textContent='Preparando "'+r.title+'"…';
    var x=new XMLHttpRequest(); x.open('GET', SRV+'/play?x='+r.tapx+'&y='+r.tapy+'&t='+encodeURIComponent(r.title), true); x.timeout=90000;
    x.onreadystatechange=function(){ if(x.readyState!==4) return;
      if(x.status===200){ try{ var d=JSON.parse(x.responseText);
        if(d.url){ openSearchHide(); openUrl(d.url, r.title); } else $('sstatus').textContent=d.msg||'ok'; }
      catch(e){ $('sstatus').textContent='ok'; } } else $('sstatus').textContent='Erro ao preparar ('+x.status+')'; };
    x.onerror=function(){ $('sstatus').textContent='Sem resposta do controlador'; };
    x.send();
  }
  function openSearchHide(){ $('searchView').style.display='none'; }
  function handleSearchKey(code){
    if(code===10009||code===10182){ if(szone==='res'){ szone='kbd'; renderRes(); renderKB(); } else closeSearch(); return; }
    if(szone==='kbd'){
      if(code===37){ if(kf>0){kf--;renderKB();} }
      else if(code===39){ if(kf<KB.length-1){kf++;renderKB();} }
      else if(code===38){ if(kf>=KCOLS){kf-=KCOLS;renderKB();} }
      else if(code===40){ if(kf+KCOLS<KB.length){kf+=KCOLS;renderKB();} else if(sresu.length){ szone='res'; sf=0; renderRes(); renderKB(); } }
      else if(code===13){ pressKey(KB[kf]); }
    } else {
      if(code===37){ if(sf>0){sf--;renderRes();} }
      else if(code===39){ if(sf<sresu.length-1){sf++;renderRes();} }
      else if(code===38){ if(sf>=RCOLS){sf-=RCOLS;renderRes();} else { szone='kbd'; renderKB(); renderRes(); } }
      else if(code===40){ if(sf+RCOLS<sresu.length){sf+=RCOLS;renderRes();} }
      else if(code===13){ selectResult(sresu[sf]); }
    }
  }

  /* ---------- teclas ---------- */
  function onKey(code){
    if(playing){ if(code===10009||code===10182||code===13) closePlayer(); return; }
    if(searchOpen){ handleSearchKey(code); return; }
    if(code===38){
      if(zone==='chan'){ if(ci>0){ci--;refreshChan();} else {zone='tabs';focusTabs();} }
      else if(zone==='tabs'){ zone='top'; }
    }
    else if(code===40){
      if(zone==='top'){ zone='tabs'; focusTabs(); }
      else if(zone==='tabs'){ zone='chan'; setTab('LIVE'); focusTabs(); refreshChan(); }
      else if(ci<chans.length-1){ ci++; refreshChan(); }
    }
    else if(code===37){ if(zone==='tabs'&&ti>0){ ti--; setTab(TABS[ti]); focusTabs(); } }
    else if(code===39){ if(zone==='tabs'&&ti<TABS.length-1){ ti++; setTab(TABS[ti]); focusTabs(); } }
    else if(code===13){
      if(zone==='top'){ openSearch(); }
      else if(zone==='tabs'){ setTab(TABS[ti]); if(TABS[ti]==='LIVE'){ zone='chan'; focusTabs(); refreshChan(); } }
      else if(zone==='chan'){ openPlayer(chans[ci]); }
    }
    else if(code===10009||code===10182){ try{ tizen.application.getCurrentApplication().exit(); }catch(e){} }
    updateTop();
  }

  function clock(){ var d=new Date(); var c=$('clock'); if(c) c.textContent=pad(d.getHours())+':'+pad(d.getMinutes()); }
  function boot(){
    try{
      B("boot","chans="+chans.length);
      buildKB(); setTab('LIVE'); refreshChan(); clock(); setInterval(clock,20000);
      document.addEventListener('keydown', function(e){ onKey(e.keyCode); });
      B("rendered","ok");
    }catch(e){ B("BOOTERR", e && e.message ? e.message : (''+e)); toast('Erro boot: '+e); }
  }
  window.onload=boot;
})();
