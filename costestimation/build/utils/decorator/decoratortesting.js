import fp from 'fastify-plugin';
export default fp(function (fastify, opts, done) {
    fastify.decorate('decoratorB', function (request, key, value) {
        console.log('decorare functon');
        return request[key] = value;
    });
    done();
});
//# sourceMappingURL=decoratortesting.js.map