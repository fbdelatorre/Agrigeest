// Keep the original service-worker URL valid for previously installed PWAs.
// The current worker updates only application assets; user data stays untouched.
importScripts('/service-worker.js');
