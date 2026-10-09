// Optional browser check: install Playwright or point BUDDY_PLAYWRIGHT_MODULE to it.
const { chromium } = require(process.env.BUDDY_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
require('node:fs').mkdirSync('.local', { recursive: true });
(async () => {
  const { createBuddyServer } = await import('../server/index.mjs');
  const server = createBuddyServer({env:{}});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({executablePath:process.env.BUDDY_CHROME_PATH || undefined,headless:true});
  try {
    const context = await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(() => {
      window.trackStopped = false;
      window.mic = {enabled:true, stop(){window.trackStopped=true;}};
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{writable:true,configurable:true,value:async()=>({getTracks:()=>[window.mic],getAudioTracks:()=>[window.mic]})});
      window.RTCPeerConnection = class {
        constructor(){window.peer=this;}
        addTrack(){}
        createDataChannel(){return window.channel={readyState:'open',send(){},close(){this.onclose?.();}};}
        async createOffer(){return {type:'offer',sdp:'v=0'};}
        async setLocalDescription(){}
        async setRemoteDescription(){window.channel.onopen();}
        close(){this.closed=true;}
      };
      window.emitVoice = event => window.channel.onmessage({data:JSON.stringify(event)});
    });
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/session',route=>route.fulfill({status:200,contentType:'application/sdp',body:'v=0'}));
    for(const [name,width,height] of [['phone',390,844],['small',320,568],['tablet',1280,800],['desktop',1440,1000]]) {
      await page.setViewportSize({width,height});
      await page.goto(base);
      await page.waitForFunction(()=>document.querySelector('#avatar').dataset.animated==='true');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');
      await page.screenshot({path:`.local/voice-${name}.png`,fullPage:true});
    }
    await page.click('#talk-button');
    await page.fill('#access-code','test-code');
    await page.click('#start-voice');
    await page.waitForFunction(()=>window.peer && document.querySelector('#avatar').dataset.state==='listening');
    await page.evaluate(()=>{
      emitVoice({type:'response.created'});
      emitVoice({type:'response.output_audio_transcript.delta',delta:'Let’s fly a rocket to the moon!'});
      emitVoice({type:'output_audio_buffer.started'});
    });
    assert.equal(await page.locator('#scene').getAttribute('data-scene'),'space');
    assert.equal(await page.locator('#avatar').getAttribute('data-state'),'talking');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'.local/voice-talking.png',fullPage:true});
    await page.evaluate(()=>emitVoice({type:'response.done',response:{status:'completed'}}));
    assert.equal(await page.locator('#avatar').getAttribute('data-state'),'talking');
    await page.evaluate(()=>emitVoice({type:'output_audio_buffer.stopped'}));
    assert.equal(await page.locator('#avatar').getAttribute('data-state'),'listening');
    await page.click('#mute-button');
    assert.equal(await page.evaluate(()=>window.mic.enabled),false);
    await page.click('#mute-button');
    assert.equal(await page.evaluate(()=>window.mic.enabled),true);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.boy-head').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.click('#end-button');
    assert.ok(await page.evaluate(()=>window.trackStopped && window.peer.closed));
    assert.equal(await page.locator('#avatar').getAttribute('data-state'),'idle');
    // Ending while a permission request is pending must stop the late media stream.
    await page.evaluate(()=>{
      window.trackStopped=false;
      navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.resolveMic=resolve);
    });
    await page.click('#talk-button');
    await page.click('#start-voice');
    await page.click('#end-button');
    await page.evaluate(()=>window.resolveMic({getTracks:()=>[window.mic],getAudioTracks:()=>[window.mic]}));
    await page.waitForFunction(()=>window.trackStopped);
    assert.equal(await page.locator('#avatar').getAttribute('data-state'),'idle');
    await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
    await page.click('#talk-button');
    await page.click('#start-voice');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('not allowed'));
    await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[window.mic],getAudioTracks:()=>[window.mic]});});
    await page.unroute('**/api/session');
    await page.click('#talk-button');
    await page.click('#start-voice');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('configure the voice server'));
    assert.ok(await page.evaluate(()=>window.trackStopped && window.peer.closed));
    assert.deepEqual(errors,[]);
    console.log('PASS: four responsive layouts, scene/caption updates, playback states, mute, reduced motion, end cleanup, pending permission cancellation, denied microphone, missing-server cleanup; no browser exceptions.');
  } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
