module.exports = function override(config, env) {
  // Node.js 모듈을 빈 객체로 설정 (브라우저 환경용)
  // 다른 라이브러리에서 사용할 수 있으므로 기본 fallback 설정 유지
  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    fs: false,
    path: false,
    crypto: false,
    stream: false,
    util: false,
    buffer: false,
    process: false,
    os: false,
    net: false,
    tls: false,
    child_process: false,
  };

  return config;
};

