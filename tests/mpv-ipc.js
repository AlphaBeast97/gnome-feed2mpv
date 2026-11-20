import {MpvIpcMonitor} from '../src/mpv-ipc.js';

const states = [];
const errors = [];
const monitor = new MpvIpcMonitor(
    state => states.push(state),
    (detail, source) => errors.push([detail, source]));

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
if (errors.length !== 0)
    throw new Error('A normal end of file should not report a playback error');

monitor.expectLoad('queue');
monitor._handleMessage({event: 'end-file', reason: 'error', file_error: 'loading failed'});
if (errors.length !== 1 || errors[0][0] !== 'loading failed' || errors[0][1] !== 'queue')
    throw new Error('A failed queued file should report the error with its source');

monitor.expectLoad();
monitor._handleMessage({event: 'end-file', reason: 'error'});
if (errors.length !== 2 || errors[1][0] !== 'loading failed' || errors[1][1] !== 'launch')
    throw new Error('A failed launch should report the error with its source');

monitor.expectLoad();
monitor.cancelLoad();
if (monitor.state !== 'idle')
    throw new Error('Failed launch should clear the loading state');

monitor.destroy();
print('MPV IPC state checks passed');
