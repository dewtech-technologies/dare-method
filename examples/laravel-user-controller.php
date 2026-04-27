<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class UserController extends Controller
{
    /**
     * Listar todos os usuários (com paginação)
     */
    public function index(): JsonResponse
    {
        $users = User::paginate(15);
        
        return response()->json([
            'data' => UserResource::collection($users),
            'meta' => [
                'total' => $users->total(),
                'per_page' => $users->perPage(),
                'current_page' => $users->currentPage(),
            ],
        ]);
    }

    /**
     * Criar novo usuário
     */
    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::create($request->validated());

        return response()->json([
            'data' => new UserResource($user),
            'message' => 'Usuário criado com sucesso.',
        ], Response::HTTP_CREATED);
    }

    /**
     * Obter um usuário específico
     */
    public function show(User $user): JsonResponse
    {
        return response()->json([
            'data' => new UserResource($user),
        ]);
    }

    /**
     * Atualizar um usuário
     */
    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $user->update($request->validated());

        return response()->json([
            'data' => new UserResource($user),
            'message' => 'Usuário atualizado com sucesso.',
        ]);
    }

    /**
     * Deletar um usuário
     */
    public function destroy(User $user): JsonResponse
    {
        $user->delete();

        return response()->json([
            'message' => 'Usuário deletado com sucesso.',
        ]);
    }
}
