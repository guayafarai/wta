const container = document.getElementById('videoContainer');
const video = document.getElementById('video');
const embedPlayer = document.getElementById('embedPlayer');

async function playStream(url, name, type) {
    document.getElementById('playerTitle').textContent = name;
    container.style.display = 'flex';

    // Forzar Pantalla Completa
    try {
        if (container.requestFullscreen) await container.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) {}

    video.style.display = 'none';
    embedPlayer.style.display = 'none';

    if (type === 'embed') {
        embedPlayer.style.display = 'block';
        embedPlayer.src = url;
    } else {
        video.style.display = 'block';
        // Lógica HLS/DASH aquí...
        video.src = url;
        video.play();
    }
}

function stopStream() {
    container.style.display = 'none';
    video.pause();
    embedPlayer.src = '';
    if (document.exitFullscreen) document.exitFullscreen();
}