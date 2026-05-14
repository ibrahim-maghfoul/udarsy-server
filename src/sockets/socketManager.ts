import { Server } from 'socket.io';

let _io: Server | null = null;

export const initSocketManager = (io: Server) => { _io = io; };

export const getIO = (): Server => {
    if (!_io) throw new Error('Socket.io not initialized');
    return _io;
};
