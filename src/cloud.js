// Capa de nube (Firebase). Se empaqueta con esbuild en app/cloud.js
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';

let app, auth, db;
const COLS = ['productos', 'proveedores', 'movimientos', 'stockMovs', 'eventos', 'personal', 'turnos', 'caterings', 'cierres', 'auditoria'];

window.Cloud = {
  COLS,
  init(config) {
    app = initializeApp(config);
    auth = getAuth(app);
    setPersistence(auth, indexedDBLocalPersistence).catch(() => {});
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
    if (config.emulatorHost) { connectAuthEmulator(auth, `http://${config.emulatorHost}:9099`, { disableWarnings: true }); connectFirestoreEmulator(db, config.emulatorHost, 8080); } // solo para pruebas
  },
  onAuth(cb) { return onAuthStateChanged(auth, cb); },
  login(email, pass) { return signInWithEmailAndPassword(auth, email, pass); },
  logout() { return signOut(auth); },
  reset(email) { return sendPasswordResetEmail(auth, email); },
  user() { return auth && auth.currentUser; },
  // onData(nombreColeccion, arrayDeDocs, {fromCache, pendientes})
  subscribe(uid, onData, onError) {
    const unsubs = COLS.map((c) => onSnapshot(collection(db, 'users', uid, c), { includeMetadataChanges: true }, (snap) => {
      onData(c, snap.docs.map((d) => d.data()), { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
    }, onError));
    unsubs.push(onSnapshot(doc(db, 'users', uid, 'meta', 'config'), { includeMetadataChanges: true }, (d) => onData('config', d.exists() ? d.data() : null, { fromCache: d.metadata.fromCache, pending: d.metadata.hasPendingWrites }), onError));
    return () => unsubs.forEach((u) => u());
  },
  // ops: [{col, id, data}] o [{col, id, del:true}]; col 'config' => users/uid/meta/config
  async write(uid, ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      for (const op of ops.slice(i, i + 400)) {
        const ref = op.col === 'config' ? doc(db, 'users', uid, 'meta', 'config') : doc(db, 'users', uid, op.col, op.id);
        if (op.del) b.delete(ref); else b.set(ref, op.data);
      }
      // no esperamos al servidor: con caché local la escritura queda en cola si no hay internet
      b.commit().catch((e) => window.dispatchEvent(new CustomEvent('cloud-error', { detail: e })));
    }
  },
};
