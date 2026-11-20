import {MpvIpcMonitor} from '../src/mpv-ipc.js';

const states = [];
const monitor = new MpvIpcMonitor(state => states.push(state));

monitor.expectLoad();
if (monitor.state !== 'loading')
    throw new Error('MPV should enter loading state before launch');
monitor._handleMessage({event: 'property-change', name: 'idle-active', data: false});
monitor._handleMessage({event: 'property-change', name: 'pause', data: false});
if (monitor.state !== 'playing')
    throw new Error('MPV should enter playing state after playback starts');
monitor._handleMessage({event: 'property-change', name: 'pause', data: true});
if (monitor.state !== 'paused')
    throw new Error('MPV pause state was not detected');
monitor._handleMessage({event: 'end-file'});
if (monitor.state !== 'idle')
    throw new Error('MPV should return to idle state after a file ends');
monitor.expectLoad();
monitor.cancelLoad();
if (monitor.state !== 'idle')
    throw new Error('Failed launch should clear the loading state');

monitor.destroy();
print('MPV IPC state checks passed');
