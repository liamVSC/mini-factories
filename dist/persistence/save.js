export function serialise(state) {
    const data = { ...state };
    delete data.week;
    delete data.weekTime;
    delete data.version;
    return {
        version: 6,
        ...data,
        selected: null,
        trucks: [],
        particles: []
    };
}
//# sourceMappingURL=save.js.map