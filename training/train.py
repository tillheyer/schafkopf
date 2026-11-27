"""Trainiert das MEGA-Netz aus den Daten von gen.ts.

Aufruf: python3 train.py <ausgabe.json> <daten.bin> [<daten.bin> ...] [--init alt.pt] [--epochs N]
"""
import argparse, json, math, sys
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F

FEAT = 445
REC = FEAT + 4 + 128 + 1 + 4 + 4 + 1 + 1
H1, H2 = 384, 256

def load(paths):
    raw = np.concatenate([np.fromfile(p, dtype=np.uint8) for p in paths])
    raw = raw.reshape(-1, REC)
    o = 0
    x = raw[:, :FEAT].astype(np.float32) / 255.0; o += FEAT
    mask_u32 = raw[:, o:o + 4].copy().view('<u4').reshape(-1); o += 4
    mask = ((mask_u32[:, None] >> np.arange(32, dtype=np.uint32)) & 1).astype(bool)
    q = raw[:, o:o + 128].copy().view('<f4').reshape(-1, 32); o += 128
    chosen = raw[:, o].astype(np.int64); o += 1
    z = raw[:, o:o + 4].copy().view('<f4').reshape(-1); o += 4
    stake = raw[:, o:o + 4].copy().view('<f4').reshape(-1); o += 4
    weak = raw[:, o]
    keep = weak == 0  # nur Entscheidungen des starken Computers nachahmen
    return x[keep], mask[keep], q[keep], chosen[keep], z[keep]

class Net(nn.Module):
    def __init__(self, H1=H1, H2=H2):
        super().__init__()
        self.l1 = nn.Linear(FEAT, H1)
        self.l2 = nn.Linear(H1, H2)
        self.q = nn.Linear(H2, 32)
        self.pi = nn.Linear(H2, 32)
        self.v = nn.Linear(H2, 1)
    def forward(self, x):
        h = F.relu(self.l1(x))
        h = F.relu(self.l2(h))
        return self.q(h), self.pi(h), self.v(h).squeeze(-1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('data', nargs='+')
    ap.add_argument('--init')
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--h1', type=int, default=H1)
    ap.add_argument('--h2', type=int, default=H2)
    a = ap.parse_args()
    torch.manual_seed(0)
    x, mask, q, chosen, z = load(a.data)
    n = len(x)
    print(f'{n} Beispiele', flush=True)
    perm = np.random.default_rng(0).permutation(n)
    nval = min(20000, n // 10)
    val, tr = perm[:nval], perm[nval:]
    X = torch.tensor(x); M = torch.tensor(mask); Q = torch.tensor(np.nan_to_num(q, nan=0.0))
    QM = torch.tensor(~np.isnan(q)); C = torch.tensor(chosen); Z = torch.tensor(z)
    net = Net(a.h1, a.h2)
    if a.init:
        net.load_state_dict(torch.load(a.init))
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=1e-4)
    bs = 512
    steps = a.epochs * (len(tr) // bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=steps)

    def losses(idx):
        xb, mb, qb, qm, cb, zb = X[idx], M[idx], Q[idx], QM[idx], C[idx], Z[idx]
        qp, logit, v = net(xb)
        lq = (F.smooth_l1_loss(qp, qb, reduction='none', beta=0.5) * qm).sum() / qm.sum()
        logit = logit.masked_fill(~mb, -1e9)
        lpi = F.cross_entropy(logit, cb)
        lv = F.smooth_l1_loss(v, zb, beta=1.0)
        # Wie oft wählt das Netz (Q-Kopf / Policy) dieselbe Karte wie der starke Computer?
        acc_q = (qp.masked_fill(~mb, -1e9).argmax(1) == cb).float().mean()
        acc_pi = (logit.argmax(1) == cb).float().mean()
        return lq, lpi, lv, acc_q, acc_pi

    for ep in range(a.epochs):
        net.train()
        rng = np.random.default_rng(ep + 1)
        order = tr[rng.permutation(len(tr))]
        tot = np.zeros(3)
        for i in range(len(tr) // bs):
            idx = torch.tensor(order[i * bs:(i + 1) * bs])
            lq, lpi, lv, _, _ = losses(idx)
            loss = lq + 0.5 * lpi + 0.25 * lv
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tot += [lq.item(), lpi.item(), lv.item()]
        net.eval()
        with torch.no_grad():
            r = [t.item() for t in losses(torch.tensor(val))]
        k = len(tr) // bs
        print(f'Epoche {ep+1}: train q {tot[0]/k:.4f} pi {tot[1]/k:.4f} v {tot[2]/k:.4f} | val q {r[0]:.4f} pi {r[1]:.4f} v {r[2]:.4f} gleiche Karte q {r[3]:.3f} pi {r[4]:.3f}', flush=True)
    torch.save(net.state_dict(), a.out.replace('.json', '.pt'))
    export(net, a.out)

def export(net, path):
    """Gewichte als int8 je Ausgabezeile mit eigenem Maßstab, Bias als float32 (base64)."""
    import base64
    layers = []
    for name in ['l1', 'l2', 'q', 'pi', 'v']:
        l = getattr(net, name)
        w = l.weight.detach().numpy().astype(np.float32)
        b = l.bias.detach().numpy().astype(np.float32)
        scale = np.maximum(np.abs(w).max(1), 1e-8) / 127.0
        wq = np.round(w / scale[:, None]).astype(np.int8)
        layers.append({
            'name': name, 'out': w.shape[0], 'in': w.shape[1],
            'w': base64.b64encode(wq.tobytes()).decode(),
            'scale': base64.b64encode(scale.astype(np.float32).tobytes()).decode(),
            'b': base64.b64encode(b.tobytes()).decode(),
        })
    json.dump({'features': FEAT, 'layers': layers}, open(path, 'w'))
    print('gespeichert', path)

if __name__ == '__main__':
    main()
