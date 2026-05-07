import { Server, Socket } from 'socket.io';
import Message from '../models/Message';
import ChatRoom from '../models/ChatRoom';
import { TeacherRoomMessage } from '../models/TeacherRoomMessage';
import { TeacherRoom } from '../models/TeacherRoom';
import { containsBadWord } from '../utils/profanityFilter';

// In-memory active user tracker: room -> Map of { userId -> details }
const roomUsers = new Map<string, Map<string, { userId: string, displayName: string, photoURL?: string, subscriptionPlan?: string }>>();

// Mapping socket IDs to user context for disconnect handling
const socketContexts = new Map<string, { room: string, userId: string }>();

// Teacher room in-memory users: roomId -> Set of { userId -> details }
const teacherRoomUsers = new Map<string, Map<string, { userId: string, displayName: string, isTeacher: boolean }>>();
const teacherSocketContexts = new Map<string, { roomId: string, userId: string }>();

export const handleChatConnection = (io: Server, socket: Socket) => {

    // ── General Chat Room ─────────────────────────────────────────────────────

    socket.on('join_room', async (data: {
        guidance: string; level: string; userId: string;
        displayName: string; photoURL?: string; subscriptionPlan?: string
    }) => {
        const roomKey = `${data.guidance}_${data.level}`;
        socket.join(roomKey);

        await ChatRoom.findOneAndUpdate(
            { roomKey },
            { $setOnInsert: { guidance: data.guidance, level: data.level, roomKey }, $addToSet: { participants: data.userId } },
            { upsert: true, new: true }
        );

        const populatedRoom = await ChatRoom.findOne({ roomKey }).populate('participants', 'displayName photoURL subscription.plan');
        if (populatedRoom) io.to(roomKey).emit('room_participants', populatedRoom.participants);

        if (!roomUsers.has(roomKey)) roomUsers.set(roomKey, new Map());
        roomUsers.get(roomKey)!.set(data.userId, {
            userId: data.userId, displayName: data.displayName,
            photoURL: data.photoURL, subscriptionPlan: data.subscriptionPlan,
        });
        socketContexts.set(socket.id, { room: roomKey, userId: data.userId });

        io.to(roomKey).emit('room_users', Array.from(roomUsers.get(roomKey)!.values()));
    });

    socket.on('send_message', async (data: {
        guidance: string; level: string; sender: string; text: string; replyTo?: string
    }) => {
        const roomKey = `${data.guidance}_${data.level}`;

        // Profanity check
        if (containsBadWord(data.text)) {
            socket.emit('message_blocked', { reason: 'يحتوي رسالتك على كلمات غير لائقة' });
            return;
        }

        try {
            const chatRoom = await ChatRoom.findOne({ roomKey });
            if (!chatRoom) return;

            const newMessage = new Message({
                chatRoomId: chatRoom._id,
                sender: data.sender,
                text: data.text,
                reactions: [],
                replyTo: data.replyTo || undefined,
            });
            await newMessage.save();

            chatRoom.lastMessagePreview = data.text;
            chatRoom.lastMessageAt = new Date();
            await chatRoom.save();

            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'displayName photoURL subscription.plan role')
                .populate({ path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: '_id displayName subscription.plan' } });

            io.to(roomKey).emit('receive_message', populatedMessage);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('reaction', async (data: { messageId: string; emoji: string; userId: string; guidance: string; level: string }) => {
        const roomKey = `${data.guidance}_${data.level}`;
        try {
            const message = await Message.findById(data.messageId);
            if (!message) return;

            const existingIdx = message.reactions.findIndex((r: any) => r.userId.toString() === data.userId && r.emoji === data.emoji);
            if (existingIdx > -1) {
                message.reactions.splice(existingIdx, 1);
            } else {
                message.reactions.push({ emoji: data.emoji, userId: data.userId as any });
            }
            await message.save();

            const populatedMessage = await Message.findById(message._id)
                .populate('sender', 'displayName photoURL subscription.plan')
                .populate({ path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: '_id displayName subscription.plan' } });
            io.to(roomKey).emit('message_updated', populatedMessage);
        } catch (error) {
            console.error('Error updating reaction:', error);
        }
    });

    socket.on('typing_start', (data: { guidance: string; level: string; userId: string; displayName: string }) => {
        const roomKey = `${data.guidance}_${data.level}`;
        socket.to(roomKey).emit('user_typing', { userId: data.userId, displayName: data.displayName });
    });

    socket.on('typing_end', (data: { guidance: string; level: string; userId: string }) => {
        const roomKey = `${data.guidance}_${data.level}`;
        socket.to(roomKey).emit('user_stopped_typing', { userId: data.userId });
    });

    // ── Teacher Room ──────────────────────────────────────────────────────────

    socket.on('join_teacher_room', async (data: {
        roomId: string; userId: string; displayName: string; isTeacher: boolean
    }) => {
        const key = `teacher_${data.roomId}`;
        socket.join(key);

        if (!teacherRoomUsers.has(key)) teacherRoomUsers.set(key, new Map());
        teacherRoomUsers.get(key)!.set(data.userId, {
            userId: data.userId, displayName: data.displayName, isTeacher: data.isTeacher,
        });
        teacherSocketContexts.set(socket.id, { roomId: key, userId: data.userId });

        io.to(key).emit('teacher_room_users', Array.from(teacherRoomUsers.get(key)!.values()));
        console.log(`User ${data.displayName} joined teacher room ${data.roomId}`);
    });

    socket.on('send_teacher_message', async (data: {
        roomId: string; sender: string; isTeacher: boolean;
        text?: string; messageType?: string;
        fileUrl?: string; fileName?: string; fileSize?: number;
        linkUrl?: string; linkTitle?: string; replyTo?: string;
    }) => {
        const key = `teacher_${data.roomId}`;

        // Profanity check on text messages
        if (data.text && containsBadWord(data.text)) {
            socket.emit('message_blocked', { reason: 'يحتوي رسالتك على كلمات غير لائقة' });
            return;
        }

        // Only teachers can send files or links
        if ((data.messageType === 'file' || data.messageType === 'link') && !data.isTeacher) {
            socket.emit('message_blocked', { reason: 'فقط الأستاذ يمكنه مشاركة الملفات والروابط' });
            return;
        }

        try {
            const room = await TeacherRoom.findById(data.roomId);
            if (!room || !room.isActive) return;

            const newMsg = await TeacherRoomMessage.create({
                roomId: data.roomId,
                sender: data.sender,
                text: data.text,
                messageType: data.messageType ?? 'text',
                fileUrl: data.fileUrl,
                fileName: data.fileName,
                fileSize: data.fileSize,
                linkUrl: data.linkUrl,
                linkTitle: data.linkTitle,
                replyTo: data.replyTo || undefined,
            });

            room.lastMessagePreview = data.text ?? (data.messageType === 'file' ? `📎 ${data.fileName}` : `🔗 ${data.linkTitle}`);
            room.lastMessageAt = new Date();
            await room.save();

            const populated = await TeacherRoomMessage.findById(newMsg._id)
                .populate('sender', 'displayName photoURL role subscription.plan')
                .populate({ path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: '_id displayName' } });

            io.to(key).emit('receive_teacher_message', populated);
        } catch (error) {
            console.error('Error sending teacher room message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('teacher_typing_start', (data: { roomId: string; userId: string; displayName: string }) => {
        socket.to(`teacher_${data.roomId}`).emit('teacher_user_typing', { userId: data.userId, displayName: data.displayName });
    });

    socket.on('teacher_typing_end', (data: { roomId: string; userId: string }) => {
        socket.to(`teacher_${data.roomId}`).emit('teacher_user_stopped_typing', { userId: data.userId });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
        // General chat cleanup
        const context = socketContexts.get(socket.id);
        if (context) {
            const { room, userId } = context;
            const usersInRoom = roomUsers.get(room);
            if (usersInRoom) {
                usersInRoom.delete(userId);
                if (usersInRoom.size === 0) roomUsers.delete(room);
                else io.to(room).emit('room_users', Array.from(roomUsers.get(room)!.values()));
            }
            socketContexts.delete(socket.id);
        }

        // Teacher room cleanup
        const tContext = teacherSocketContexts.get(socket.id);
        if (tContext) {
            const { roomId, userId } = tContext;
            const usersInRoom = teacherRoomUsers.get(roomId);
            if (usersInRoom) {
                usersInRoom.delete(userId);
                if (usersInRoom.size === 0) teacherRoomUsers.delete(roomId);
                else io.to(roomId).emit('teacher_room_users', Array.from(teacherRoomUsers.get(roomId)!.values()));
            }
            teacherSocketContexts.delete(socket.id);
        }

        console.log(`User ${socket.id} disconnected`);
    });
};
