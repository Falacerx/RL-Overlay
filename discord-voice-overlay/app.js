const Discord = require("discord.js");
const bot = new Discord.Client({ disableEveryone: true });
const fs = require("fs");
const WebSocket = require('ws');

const auth = require("./auth.json");

let trackedUser, trackedChannel;
let blueTeamChannel, orangeTeamChannel;
let currentPlayers = [];

let connection;

let DEBUG = false, CLOSE_CONN = false;

const wss = new WebSocket.Server({
    port: 49622
}, () => {
    console.log('Websocket server is online');
});

wss.on('connection', ws => {
    connection = ws;
    if (DEBUG) {
        ws.on('message', function incoming(message) {
            console.log('received: %s', message);
        });
    }
});


function generateEvent(event, data) {
    return JSON.stringify({
        "event": event,
        "data": data
    });
}

const { Readable } = require('stream');

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
    _read() {
        this.push(SILENCE_FRAME);
    }
}

bot.on("ready", async () => {
    console.log(`${bot.user.username} is online!`);

});

bot.on("message", async message => {
    if (message.author.bot) return;
    if (message.content.indexOf('!') !== 0) return;

    let args = message.content.slice(1).split(/ +/);
    let cmd = args.shift().toLowerCase();


    if (cmd === 'track') {
        if (!blueTeamChannel) blueTeamChannel = message.guild.channels.cache.find(c => c.name === 'Blue Team');
        if (!orangeTeamChannel) orangeTeamChannel = message.guild.channels.cache.find(c => c.name === 'Orange Team');
        trackedUser = message.author;
        message.channel.send(`Started tracking voice activity of ${trackedUser}`);

    }
    else if (cmd === 'stop') {
        trackedUser = null;
        message.channel.send(`Stopped tracking ${trackedUser}`);
        trackedChannel.leave();
    }
    else if (cmd === 'debug') {
        DEBUG = !DEBUG;
        message.channel.send(`${DEBUG ? "Enabled" : "Disabled"} debugging`);
    }
});

bot.on("voiceStateUpdate", async (oldstate, newstate) => {
    if (newstate.member.user.bot || !connection || !newstate.channel) return;
    if (trackedUser && newstate.id === trackedUser.id && [blueTeamChannel.id, orangeTeamChannel.id].includes(newstate.channel.id) && (oldstate.channel ? newstate.channel.id !== oldstate.channel.id : true)) {
        trackedChannel = newstate.guild.channels.cache.find(c => c.id === newstate.channel.id);

        currentPlayers = [];
        console.log('Started listening to the team channels.');
        let playerList = fs.readFileSync("players.json");
        let i = 1;
        let pl = trackedChannel.members;
        pl.sort((a, b) => (a.nickname ? a.nickname : a.displayName) - (b.nickname ? b.nickname : b.displayName))
        pl.forEach(player => {
            let name = player.nickname ? player.nickname : player.displayName
            if (playerList.includes(name)) {
                currentPlayers.push({ "identifier": `player-${i}`, "name": name, "id": player.id });
                i += 1;
            }
        });

        let evt = generateEvent("sos:discord_channel_join", { "colour": trackedChannel.name.split(" ")[0].toLowerCase(), "players": currentPlayers });
        connection.send(evt);

        trackedChannel.join().then(conn => {
            dispatcher = conn.play(new Silence(), { type: 'opus', passes: 1 });

            conn.on('speaking', (user, speaking) => {
                if (!user) return;
                let player = currentPlayers.find(p => p.id === user.id);
                if (!player || currentPlayers.length === 0 || !trackedUser || !trackedChannel)
                    return console.log(!player, currentPlayers.length === 0, !trackedUser, !trackedChannel);
                let data = {
                    "colour": trackedChannel.name.split(" ")[0].toLowerCase(),
                    "player": player.identifier,
                    "speaking": speaking.bitfield
                }

                let evt = generateEvent("sos:discord_speaking_update", data);
                connection.send(evt);
            });
        });
    }
    else if (trackedUser && newstate.id === trackedUser.id && oldstate.channel !== newstate.channel) {
        console.log('Stopped listening to the team channels.');
        let evt = generateEvent("sos:discord_channel_leave", { "colour": trackedChannel.name.split(" ")[0].toLowerCase() });
        connection.send(evt);

        trackedChannel.leave();
        trackedChannel = null;
        currentPlayers = [];
    }

});


bot.login(auth.token);