'use strict';
// 사진·영상 첨부와 업로드

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const PREVIEW_SIZE = 240;          // 작성칸 미리보기 사진 크기(px)
const UPLOAD_PHOTO_SIZE = 1400;    // 올리는 사진의 긴 변 최대(px)
const UPLOAD_PHOTO_QUALITY = 0.82; // JPEG 화질

/** 사진을 긴 변 max(px) 이하로 줄여 JPEG Blob으로 만듭니다 */
function imageToBlob(file, max, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

const toDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/** 영상 길이(초). 브라우저가 재생할 수 없는 형식이면 null */
function videoLength(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file), video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}

/** 파일 선택창에서 고른 파일을 작성 중인 기록(draft)에 붙입니다. 아직 서버에 올리지는 않습니다 */
async function attach(kind, files) {
  for (const file of files) {
    if (kind === 'photo') {
      try { draft.files.push({ kind, file, preview: await toDataUrl(await imageToBlob(file, PREVIEW_SIZE, 0.7)) }); }
      catch { toast(`${file.name}을 읽지 못했어요. JPG나 PNG 사진을 올려 주세요.`); }
      continue;
    }
    if (file.size > MAX_VIDEO_BYTES) { toast('영상이 20MB보다 커요. 더 짧은 영상을 골라 주세요.'); continue; }
    const length = await videoLength(file);
    if (length === null) { toast('이 영상 형식은 재생할 수 없어요. MP4 영상을 올려 주세요.'); continue; }
    if (length > 5.5) toast('앞 5초만 재생돼요.');
    draft.files.push({ kind, file, clipEnd: Math.min(5, length || 5) });
  }
  renderPanel();
}

/** 파일을 서버에 올리고 { id, url }을 받습니다 */
async function upload(blob) {
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Requested-With': 'moa' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '파일을 올리지 못했어요.');
  return data;
}

/** 첨부 하나를 올리고 기록에 넣을 값을 돌려줍니다 (사진은 줄여서 올립니다) */
async function storeFile(attachment) {
  const blob = attachment.kind === 'photo' ? await imageToBlob(attachment.file, UPLOAD_PHOTO_SIZE, UPLOAD_PHOTO_QUALITY) : attachment.file;
  const uploaded = await upload(blob);
  return { url: uploaded.url, assetId: uploaded.id, ...(attachment.kind === 'video' ? { clipEnd: attachment.clipEnd } : {}) };
}
