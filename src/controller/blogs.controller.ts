import { FastifyRequest, FastifyReply } from "fastify";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { blogService } from "../services/blogs.service.js";
interface idparams {
    id: number
}
export module blogscontroller {
    export const upsertBlogs = async (request: any, reply: any) => {
        try {
            const bannerData = request.body;
            let upsertBlogResult = await blogService.upsertBlogs(bannerData);
            if (upsertBlogResult.command === "UPDATE" || upsertBlogResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertBlogResult.command === "UPDATE"
                        ? `Banner Updated successfully`
                        : `Banner Inserted successfully`
                };
                reply.status(200).send(message);
            }else{
                reply.status(404).send(upsertBlogResult);
            }
        } catch (error) {
            console.log('ERROR IN  Controller upsertBlog', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);        
           }
    }
    export const getAllBlogs = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getAllBlogsResult = await blogService.getAllBlogs();
            reply.status(200).send(getAllBlogsResult);
        } catch (error) {
            console.log('ERROR IN  Controller getAllBlogs', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);        }  
    }
    export const deleteBlog = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteBlogResult = await blogService.deleteBlog(Number(id));
            reply.send(deleteBlogResult);
        } catch (error) {
            console.error('ERROR IN  Controller deleteBlog', error);
            reply.send(error.message);
        }
    }

}
