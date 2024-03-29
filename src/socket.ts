import { Server } from "socket.io";
import corsOptions from "@config/corsOptions";
import type { Server as HttpServer } from "http";
import type { Message, MessageContent, docType, notiType } from "@interfaces";

//TODO: borrow / user-rate értesítések

interface ServerToClientEvents {
    "recieve-msg-cnt": (message: MessageContent) => void;
    "recieve-new-msg": (message: Message) => void;
    "recieve-notification": (
        docId: string,
        docType: docType,
        notiType: notiType,
        from: { _id: string; email: string; username?: string; fullname?: string; picture?: string },
    ) => void;
    "borrow-updated": () => void;
    "user-rate-updated": () => void;
    "msg-sent": () => void;
    "msg-seen": (userWhoSawId: string, messageId: string) => void;
}

interface ClientToServerEvents {
    "user-online": (userId: string) => void;
    "send-msg-cnt": (toId: string, message: MessageContent) => void;
    "send-new-msg": (toId: string, message: Message) => void;
    "send-notification": (
        toId: string,
        docId: string,
        docType: docType,
        notiType: notiType,
        from: { _id: string; email: string; username?: string; fullname?: string; picture?: string },
    ) => void;
    "msg-seen": (userWhoSawId: string, toId: string, messageId: string) => void;
}

export function initSocket(server: HttpServer) {
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
        cors: corsOptions,
    });
    let onlineUsers: { user_id: string; socket_id: string }[] = [];

    io.on("connection", socket => {
        socket.on("disconnecting", () => {
            const disconnectedId = socket.id;
            // console.log(
            //     disconnectedId,
            //     onlineUsers.find(u => u.socket_id == disconnectedId),
            // );
            onlineUsers = onlineUsers.filter(user => user.socket_id !== disconnectedId);

            // onlineUsers.forEach(user => {
            //     socket.to(user.socket_id).emit(
            //         "other-users",
            //         onlineUsers.map(user => user.user_id),
            //     );
            // });
        });
        socket.on("user-online", userId => {
            // socket.emit(
            //     "other-users",
            //     onlineUsers.map(user => user.user_id),
            // );

            if (!onlineUsers.some(u => u.user_id == userId)) {
                onlineUsers.push({ user_id: userId, socket_id: socket.id });
            }
            // console.log(onlineUsers);
            // socket.broadcast.emit("new-user", userId);
        });

        socket.on("send-msg-cnt", (toId, message) => {
            const sendUserSocket = onlineUsers.find(user => user.user_id === toId);
            if (sendUserSocket) {
                socket.to(sendUserSocket.socket_id).emit("recieve-msg-cnt", message);
                socket.to(sendUserSocket.socket_id).emit("msg-sent");
            }
        });

        socket.on("send-new-msg", (toId, message) => {
            const sendUserSocket = onlineUsers.find(user => user.user_id === toId);
            if (sendUserSocket) {
                socket.to(sendUserSocket.socket_id).emit("recieve-new-msg", message);
            }
        });

        socket.on("msg-seen", (userWhoSawId, toId, messageId) => {
            const sendUserSocket = onlineUsers.find(user => user.user_id === toId);
            if (sendUserSocket) {
                socket.to(sendUserSocket.socket_id).emit("msg-seen", userWhoSawId, messageId);
            }
        });

        socket.on("send-notification", (toId, docId, docType, notiType, from) => {
            const sendUserSocket = onlineUsers.find(user => user.user_id === toId);
            if (sendUserSocket) {
                socket.to(sendUserSocket.socket_id).emit("recieve-notification", docId, docType, notiType, from);
                if (docType == "borrow") {
                    socket.to(sendUserSocket.socket_id).emit("borrow-updated");
                } else if (docType == "user_rate") {
                    socket.to(sendUserSocket.socket_id).emit("user-rate-updated");
                }
            }
        });
    });
    return io;
}
