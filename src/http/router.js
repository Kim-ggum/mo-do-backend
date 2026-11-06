'use strict';
// 아주 작은 라우터: "PUT /api/cals/:id" 같은 경로를 등록하고, 요청 경로와 맞춰 봅니다.

/**
 * 핸들러는 ctx 하나를 받습니다.
 *   ctx.req, ctx.res  Node 요청/응답
 *   ctx.user          로그인한 사용자 { id, email, name, entry } 또는 null
 *   ctx.url           URL 객체 (쿼리는 ctx.url.searchParams)
 *   ctx.params        경로 변수 (예: /api/cals/:id → ctx.params.id)
 */
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, name) => { names.push(name); return '([^/]+)'; }) + '$');
    this.routes.push({ method, regex, names, handler });
    return this;
  }

  get(pattern, handler) { return this.add('GET', pattern, handler); }
  post(pattern, handler) { return this.add('POST', pattern, handler); }
  put(pattern, handler) { return this.add('PUT', pattern, handler); }
  patch(pattern, handler) { return this.add('PATCH', pattern, handler); }
  delete(pattern, handler) { return this.add('DELETE', pattern, handler); }

  /** 맞는 경로가 있으면 { handler, params }, 없으면 null. 경로 변수를 디코딩할 수 없어도 null */
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const found = route.regex.exec(pathname);
      if (!found) continue;
      try {
        const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(found[i + 1])]));
        return { handler: route.handler, params };
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { Router };
