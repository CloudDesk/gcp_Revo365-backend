import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { blogService } from "../services/blogs.service.js";
export var blogscontroller;
(function (blogscontroller) {
    blogscontroller.upsertBlogs = async (request, reply) => {
        try {
            const bannerData = request.body;
            let upsertBlogResult = await blogService.upsertBlogs(bannerData);
            console.log("Upsert Banner Result:", upsertBlogResult);
            if (upsertBlogResult.command === "UPDATE" || upsertBlogResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertBlogResult.command === "UPDATE"
                        ? `Banner Updated successfully`
                        : `Banner Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send(upsertBlogResult);
            }
        }
        catch (error) {
            console.log('ERROR IN  Controller upsertBlog', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    blogscontroller.getAllBlogs = async (request, reply) => {
        try {
            let getAllBlogsResult = await blogService.getAllBlogs();
            console.log("Get All Blogs Result:", getAllBlogsResult);
            reply.status(200).send(getAllBlogsResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller getAllBlogs', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    blogscontroller.deleteBlog = async (request, reply) => {
        try {
            console.log('Inside controller');
            const { id } = request.params;
            let deleteBlogResult = await blogService.deleteBlog(Number(id));
            reply.send(deleteBlogResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller deleteBlog', error);
            reply.send(error.message);
        }
    };
})(blogscontroller || (blogscontroller = {}));
//# sourceMappingURL=blogs.controller.js.map