const list = document.getElementById('channel-list');
const video = document.getElementById('video');
const container = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
let hls;
let allChannels = [];

fetch('config.json')
    .then(res => res.json())
    .then(data => {
        allChannels = data.channels;
        renderChannels(allChannels);
    });

function renderChannels(channels) {
    list.innerHTML = '';
    
    channels.forEach(ch => {
        const isVip = ch.is_vip;
        const card = document.createElement('div');
        card.className = 'channel-card';
        if(isVip) card.style.borderLeft = '5px solid var(--primary)';

        card.innerHTML = `
            <div class="channel-info">
                <span style="font-size: 20px;">${isVip ? '⭐' : '📺'}</span>
                <span class="channel-name">${ch.name}</span>
            </div>
            <button class="btn-play" style="background:${isVip ? 'var(--primary)' : '#222'}; color:#fff; border:none; padding:8px 15px; border-radius:8px; font-weight:bold;" 
                onclick="${isVip ? `window.open('${ch.url}', '_blank')` : `playStream('${ch.url}')`}">
                ${isVip ? 'VIP' : 'VER'}
            </button>
        `;
        list.appendChild(card);
    });
}

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allChannels.filter(ch => ch.name.toLowerCase().includes(term));
    renderChannels(filtered);
});

function playStream(url) {
    if(!url) return;
    document.body.classList.add('playing-now');
    container.style.display = 'flex';
    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
    } else {
        video.src = url;
        video.play();
    }
}

function stopStream() {
    document.body.classList.remove('playing-now');
    container.style.display = 'none';
    video.pause();
    if (hls) hls.destroy();
}