# Composants tiers intégrés

`index.html` contient, intégrés tels quels, les composants suivants.

## PeerJS 1.5.5
- Site : https://peerjs.com — source : https://github.com/peers/peerjs
- Licence : MIT — Copyright (c) 2015 Michelle Bu and Eric Zhang, http://peerjs.com
- Usage : connexion WebRTC entre la régie et les iPad caméras. Par défaut, la mise en relation utilise le serveur public de PeerJS (0.peerjs.com).

## qrcode-generator
- Source : https://github.com/kazuhikoarase/qrcode-generator
- Licence : MIT — Copyright (c) 2009 Kazuhiko Arase
- Usage : QR code d'accès des iPad caméras.
- « QR Code » est une marque déposée de DENSO WAVE INCORPORATED.

## Polices (chargées depuis Google Fonts, non intégrées)
- Barlow et Barlow Condensed — SIL Open Font License 1.1 — https://fonts.google.com/specimen/Barlow

## Outil externe (non fourni)
- ffmpeg, utilisé par `relais/relais-direct.js` pour le direct : à installer séparément (https://ffmpeg.org), sous licence LGPL/GPL selon la version.
