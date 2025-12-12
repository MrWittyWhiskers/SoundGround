const sounds = {
    hover1: new Audio('audio/hover1.mp3'),
    hover2: new Audio('audio/hover2.mp3')
};

document.querySelectorAll('[data-sound]').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
    const soundKey = btn.getAttribute('data-sound');
    const sound = sounds[soundKey];
        if (sound) {
            sound.currentTime = 0;
            sound.volume = 0.3;  // gentle volume
            sound.play();
        }
    });
});
   