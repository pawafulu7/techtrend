export default jest.fn(() => Promise.resolve({
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => '',
}));