# Historique des versions

## 1.2.0 — novembre 2026
- **Réseaux scolaires filtrés** (ex. wifipedago) : la mise en relation des iPad passe par les fonctions Netlify du site (`/api/signal`), en HTTPS ordinaire, au lieu du WebSocket du serveur public PeerJS souvent bloqué. Retour automatique à PeerJS si les fonctions sont absentes.
- **Relais d'image TURN** facultatif (`/api/ice`, Cloudflare gratuit jusqu'à 1 000 Go/mois) : l'image passe par internet sur le port 443 quand le Wi-Fi isole les appareils.
- Bouton **Tester le réseau** (régie et iPad) : diagnostic en clair et conduite à tenir.
- Message clair quand une même régie est ouverte deux fois.

## 1.1.0 — novembre 2026
- Choix du rôle de chaque appareil : **régie** (ne filme pas), **présentateur** (fond vert + prompteur) ou **caméra**.
- Le prompteur s'affiche sur l'iPad présentateur et suit la régie (lecture, vitesse, taille, changement de sujet).
- Deux QR codes dans la régie : présentateur et caméras.
- Réglages par défaut selon le rôle : présentateur incrusté avec micro ouvert, caméras en plein cadre avec son automatique.
- La caméra de la régie devient facultative.

## 1.0.0 — novembre 2026
Première version publique.
- Incrustation fond vert en temps réel, 6 décors, décor personnalisé (image ou vidéo).
- Habillage : logo, « EN DIRECT », horloge, bandeau défilant, bandeau titre, générique avec jingle.
- Conducteur avec illustrations (image ou vidéo MP4) affichées à la mise à l'antenne.
- Prompteur plein écran ou en fenêtre séparée.
- iPad caméras en réseau (WebRTC) avec voyant d'antenne, bouton « Prévenir » et décompte.
- Mixage du son par caméra (auto / ouvert / coupé), vumètres, écoute au casque.
- Enregistrement de l'émission et direct RTMP via le relais local (Facebook, Instagram, LinkedIn, YouTube).
