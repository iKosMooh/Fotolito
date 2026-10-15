// Worker da remoção de fundo: roda o modelo de segmentação via Transformers.js e devolve a máscara alfa
// no tamanho da imagem. Fica fora da thread principal para a página não congelar durante a inferência.
import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// Dois motores, ambos MIT:
// - BiRefNet lite na GPU: melhor borda (cabelo, objeto vazado). Na CPU estoura a memória do WASM
//   (std::bad_alloc), e o ONNX só aceita entrada fixa de 1024 px, então não dá para aliviar.
// - IS-Net na CPU: o modelo que os removedores de fundo de navegador usam; cabe no WASM.
const ENGINES = {
  gpu: { id: 'onnx-community/BiRefNet_lite-ONNX', device: 'webgpu', dtype: 'fp16', label: 'BiRefNet' },
  cpu: { id: 'imgly/isnet-general-onnx', device: 'wasm', dtype: 'fp16', label: 'IS-Net' },
};

// O BiRefNet tem shaders com 17 storage buffers; GPU que aceita só 16 falha no meio da inferência.
const MIN_STORAGE_BUFFERS = 17;

const cache = {};

async function gpuUsable() {
  try {
    const adapter = await self.navigator?.gpu?.requestAdapter();
    if (!adapter) return false;
    return (adapter.limits?.maxStorageBuffersPerShaderStage ?? 0) >= MIN_STORAGE_BUFFERS;
  } catch {
    return false;
  }
}

async function load(key) {
  if (cache[key]) return cache[key];
  const eng = ENGINES[key];
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total, file: `${key}:${p.file}` });
    }
  };
  self.postMessage({ type: 'status', text: `Carregando modelo (${key === 'gpu' ? 'GPU' : 'CPU'})` });
  const model = await AutoModel.from_pretrained(eng.id, { device: eng.device, dtype: eng.dtype, progress_callback });
  const processor = await AutoProcessor.from_pretrained(eng.id);
  cache[key] = { model, processor };
  return cache[key];
}

async function infer(key, blob, width, height) {
  const { model, processor } = await load(key);
  self.postMessage({ type: 'status', text: key === 'gpu' ? 'Isolando o assunto na GPU' : 'Isolando o assunto na CPU' });
  const t0 = performance.now();
  const image = await RawImage.fromBlob(blob);
  const { pixel_values } = await processor(image.rgb());
  const session = Object.values(model.sessions)[0];
  const outputs = await model({ [session.inputNames[0]]: pixel_values });
  let pred = outputs[session.outputNames[0]][0];
  if (key === 'gpu') {
    pred = pred.sigmoid();
  } else {
    // a saída do IS-Net já vem em [0,1], mas sem calibração; normaliza pelo min/max como no treino
    const d = pred.data;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < d.length; i++) {
      if (d[i] < lo) lo = d[i];
      if (d[i] > hi) hi = d[i];
    }
    const span = hi - lo || 1;
    const norm = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) norm[i] = (d[i] - lo) / span;
    pred = new pred.constructor('float32', norm, pred.dims);
  }
  const mask = await RawImage.fromTensor(pred.mul(255).to('uint8')).resize(width, height);
  const data = mask.channels === 1 ? mask.data : mask.grayscale().data;
  return { out: new Uint8Array(data), ms: Math.round(performance.now() - t0) };
}

self.onmessage = async (e) => {
  const { blob, width, height, engine = 'auto' } = e.data;
  let key = engine === 'cpu' ? 'cpu' : (await gpuUsable()) ? 'gpu' : 'cpu';
  try {
    let res;
    try {
      res = await infer(key, blob, width, height);
    } catch (err) {
      if (key !== 'gpu') throw err;
      // qualquer falha da GPU (memória, driver, limite) refaz na CPU com o IS-Net
      self.postMessage({ type: 'status', text: 'A GPU não deu conta, refazendo na CPU' });
      key = 'cpu';
      res = await infer(key, blob, width, height);
    }
    self.postMessage(
      { type: 'done', mask: res.out, device: key === 'gpu' ? 'webgpu' : 'wasm', model: ENGINES[key].label, ms: res.ms },
      [res.out.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', text: err?.message || String(err) });
  }
};
