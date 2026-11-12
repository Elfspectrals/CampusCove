# Proximity voice

Voice goes through a self-hosted LiveKit server (SFU). Laravel is not involved: the socket owns who is in which city instance.

## Server

- Dev: `docker compose up -d livekit` starts `livekit/livekit-server` in dev mode (API key `devkey`, secret `secret`), signal on `ws://localhost:7880`, media on 7881/tcp and 7882/udp.
- Socket variables: `LIVEKIT_URL` (the URL browsers connect to), `LIVEKIT_API_URL` (the URL the socket calls, `http://livekit:7880` in Docker), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. All four or none: without them the socket logs `[voice] ... proximity voice is off` and sends no token.

## Socket message `voice_token` (socket → client, once after `init`)

`{ url, token }`. The token is signed by the socket for:

| Claim | Value |
|---|---|
| identity | the player's Colyseus session id, so the front maps a voice to the avatar it already knows |
| name | the pseudo (`name#tag`) |
| room | `city-<Colyseus room id>`, one LiveKit room per city instance |
| grants | join and publish; no subscribe, no data channel |
| lifetime | 6 h |

The browser never chooses its LiveKit room, and cannot subscribe to anyone on its own.

## Who hears whom (socket)

Every 500 ms (`VOICE_SYNC_MS`) the socket lists the microphone tracks of the LiveKit room and computes, for each player, the voices they hear (`socket/src/voiceRange.ts`): players within 30 m, kept up to 34 m, on the same side of a house wall, minus the accounts that player muted. It sends only the changes with the LiveKit admin API `UpdateSubscriptions`. A modified client cannot listen across the map.

## Socket message `voice_mute` (client → socket)

`{ accounts: string[] }`, the account ids the player muted (digits only, at most 500), sent after joining the voice room and whenever the list changes. Anything else is ignored.

## Client side

- `useProximityVoice` plays each voice the socket subscribed it to through an HRTF `PannerNode` at the avatar's head, full volume up to 2 m, silent at 34 m (`VOICE_RELEASE_RANGE` in `front/src/game/voice.ts`, the same 34 m as the socket).
- Talk key `pushToTalk` (B): hold to talk, or toggle with an open mic (Settings, `cc.voice`).
- Player list `playerList` (Tab): the players of this city instance, who is speaking (LiveKit active speakers), and a mute button per account, saved in `cc.voiceMuted` until unmuted.
