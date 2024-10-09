
import fp from 'fastify-plugin'

export default fp(function (fastify, opts, done) {
    fastify.decorate('decoratorA', function (request, key, value) {
        console.log('testdata');
        console.log(value);
        return request[key] = value
    })
    done()
})