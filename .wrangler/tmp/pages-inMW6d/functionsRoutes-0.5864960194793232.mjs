import { onRequestDelete as __api_admin_users__id__sessions_js_onRequestDelete } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\admin\\users\\[id]\\sessions.js"
import { onRequestDelete as __api_admin_users__id__js_onRequestDelete } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\admin\\users\\[id].js"
import { onRequestGet as __api_admin_users__id__js_onRequestGet } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\admin\\users\\[id].js"
import { onRequestPut as __api_admin_users__id__js_onRequestPut } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\admin\\users\\[id].js"
import { onRequestGet as __api_admin_users_index_js_onRequestGet } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\admin\\users\\index.js"
import { onRequestPost as __api_admin_users_index_js_onRequestPost } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\admin\\users\\index.js"
import { onRequestPost as __api_auth_change_password_js_onRequestPost } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\auth\\change-password.js"
import { onRequestPost as __api_auth_login_js_onRequestPost } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\auth\\login.js"
import { onRequestPost as __api_auth_logout_js_onRequestPost } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\auth\\logout.js"
import { onRequestGet as __api_auth_me_js_onRequestGet } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\auth\\me.js"
import { onRequestGet as __api_setup_js_onRequestGet } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\setup.js"
import { onRequestPost as __api_setup_js_onRequestPost } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\setup.js"
import { onRequest as __notion_api___path___ts_onRequest } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\notion-api\\[[path]].ts"
import { onRequest as __api__middleware_js_onRequest } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\api\\_middleware.js"
import { onRequest as __rss_proxy_ts_onRequest } from "C:\\_pCloud\\Extensions\\project\\planner-proto\\functions\\rss-proxy.ts"

export const routes = [
    {
      routePath: "/api/admin/users/:id/sessions",
      mountPath: "/api/admin/users/:id",
      method: "DELETE",
      middlewares: [],
      modules: [__api_admin_users__id__sessions_js_onRequestDelete],
    },
  {
      routePath: "/api/admin/users/:id",
      mountPath: "/api/admin/users",
      method: "DELETE",
      middlewares: [],
      modules: [__api_admin_users__id__js_onRequestDelete],
    },
  {
      routePath: "/api/admin/users/:id",
      mountPath: "/api/admin/users",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_users__id__js_onRequestGet],
    },
  {
      routePath: "/api/admin/users/:id",
      mountPath: "/api/admin/users",
      method: "PUT",
      middlewares: [],
      modules: [__api_admin_users__id__js_onRequestPut],
    },
  {
      routePath: "/api/admin/users",
      mountPath: "/api/admin/users",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_users_index_js_onRequestGet],
    },
  {
      routePath: "/api/admin/users",
      mountPath: "/api/admin/users",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_users_index_js_onRequestPost],
    },
  {
      routePath: "/api/auth/change-password",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_change_password_js_onRequestPost],
    },
  {
      routePath: "/api/auth/login",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_login_js_onRequestPost],
    },
  {
      routePath: "/api/auth/logout",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_logout_js_onRequestPost],
    },
  {
      routePath: "/api/auth/me",
      mountPath: "/api/auth",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_me_js_onRequestGet],
    },
  {
      routePath: "/api/setup",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_setup_js_onRequestGet],
    },
  {
      routePath: "/api/setup",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_setup_js_onRequestPost],
    },
  {
      routePath: "/notion-api/:path*",
      mountPath: "/notion-api",
      method: "",
      middlewares: [],
      modules: [__notion_api___path___ts_onRequest],
    },
  {
      routePath: "/api",
      mountPath: "/api",
      method: "",
      middlewares: [__api__middleware_js_onRequest],
      modules: [],
    },
  {
      routePath: "/rss-proxy",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__rss_proxy_ts_onRequest],
    },
  ]