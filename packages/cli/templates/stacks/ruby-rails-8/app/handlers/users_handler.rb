# frozen_string_literal: true

# DARE v3.0 — UsersHandler (thin controller)
# Convention (ADR-01): HTTP concerns only — params, response codes, delegation
# No business logic, no repository calls, no queries here.

class UsersHandler < ApplicationController
  before_action :require_authentication!, only: %i[update destroy]

  # GET /api/users
  def index
    repo  = Repositories::UserRepository.new
    users = repo.all_active

    render json: UserPresenter.collection(users), status: :ok
  end

  # GET /api/users/:id
  def show
    repo = Repositories::UserRepository.new
    user = repo.find!(params[:id])

    render json: UserPresenter.new(user).as_json, status: :ok
  end

  # POST /api/users
  def create
    input = params.require(:user).permit(:email, :name, :password)

    user = Services::CreateUserService.new(
      user_repository: Repositories::UserRepository.new,
      event_publisher: RealtimeService.instance
    ).execute(
      email:    input[:email],
      name:     input[:name],
      password: input[:password]
    )

    render json: UserPresenter.new(user).as_json, status: :created

  rescue Services::CreateUserService::EmailTakenError => e
    render_problem(
      status: :conflict,
      title:  "Email Already Taken",
      detail: e.message
    )
  end

  # PATCH /api/users/:id
  def update
    repo  = Repositories::UserRepository.new
    user  = repo.find!(params[:id])
    input = params.require(:user).permit(:name)

    repo.update!(user, input.to_h)

    render json: UserPresenter.new(user).as_json, status: :ok
  end

  # DELETE /api/users/:id
  def destroy
    repo = Repositories::UserRepository.new
    user = repo.find!(params[:id])
    repo.destroy!(user)

    head :no_content
  end
end
