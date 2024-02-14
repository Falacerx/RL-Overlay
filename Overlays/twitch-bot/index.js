const WebSocket = require('ws');
const { ChatClient } = require("dank-twitch-irc");
const prompt = require('prompt');

const port = 49122;
let wsClientReady = false;

if (port < 1000 || port > 65535) {
    console.warn("Invalid port number provided. Exiting");
    process.exit(2);
}

prompt.get([
    {
        message: "IP:Port for the websocket to connect to",
        name: 'ip',
        required: true,
        default: "localhost:49122",
    },
    {
        message: "Twitch Channel to connect to",
        name: 'twitchChannel',
        required: true,
        default: 'falacer'
    },
], function (e, r) {
    const wsClient = new WebSocket("ws://"+r.ip);
    const twitchClient = new ChatClient();
    twitchClient.connect();

    wsClient.on('open', function open() {
        wsClientReady = true;
        console.log("Connected to websocket on localhost:"+port);
    });
    wsClient.on('close', function () {
        wsClientReady = false;
    });

    twitchClient.on('ready', () => {
        console.log("Joining " + r.twitchChannel);
        twitchClient.join(r.twitchChannel);
    });

    twitchClient.on('message', (message) => {
        if (wsClientReady && message.ircCommand === "PRIVMSG") {
            wsClient.send(JSON.stringify({
                event: "twitch:message",
                data: {
                    message: message.messageText,
                    sender: message.displayName,
                    sender_color: message.colorRaw
                }
            }));
            console.log(`${message.displayName}> ${message.messageText}`);
        }
    });
});