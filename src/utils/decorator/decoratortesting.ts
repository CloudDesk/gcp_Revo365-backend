import fp from 'fastify-plugin'
export default fp(function (fastify, opts, done) {

    fastify.decorate('decoratorB', function (request :any ,key : any,value :any) {
        console.log('decorare functon');
        return  request[key] = value
    })
    done()
})