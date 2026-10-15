// Passa uma imagem de uma ferramenta para outra sem servidor: guarda o arquivo no IndexedDB,
// a página de destino lê uma vez e apaga. sessionStorage não serve — estoura com imagens grandes.
const DB = 'fotolito-handoff';
const STORE = 'files';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putHandoff(target, file) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob: file, name: file.name, type: file.type }, target);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function takeHandoff(target) {
  try {
    const db = await open();
    const item = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(target);
      req.onsuccess = () => {
        if (req.result) store.delete(target);
        resolve(req.result || null);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!item) return null;
    return new File([item.blob], item.name, { type: item.type });
  } catch {
    return null;
  }
}
