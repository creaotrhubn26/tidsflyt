import postcss from "postcss";

const originalParse = postcss.parse;
postcss.parse = (css, opts = {}) => {
  const normalized = { from: "inline", ...opts };
  return originalParse(css, normalized);
};

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
